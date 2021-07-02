#! /usr/bin/env node

import puppeteer, { CDPSession, Protocol } from 'puppeteer';
import { calculate as calculateSpecificity, SpecificityArray } from 'specificity';

type StyleSheetId = string;

type CSSValue = puppeteer.Protocol.CSS.Value & {
  styleSheetId: StyleSheetId;
};

// https://chromedevtools.github.io/devtools-protocol/tot/CSS/#type-CSSStyleSheetHeader
interface CSSStyleSheetHeader {
  styleSheetId: StyleSheetId;
  sourceURL: string;
}

(async () => {
  // Open Puppeteer at the given URL.
  const url = process.argv[2];
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  const client = await page.target().createCDPSession();

  // Track stylesheets added to the page.
  const styleSheetMapping = new Map<StyleSheetId, CSSStyleSheetHeader>();
  client.on('CSS.styleSheetAdded', (evt: { header: CSSStyleSheetHeader }) => {
    const sheet = evt.header;
    styleSheetMapping.set(sheet.styleSheetId, sheet);
  });

  // Must enable Chrome DevTools Protocol domains before using them.
  await client.send('DOM.enable');
  await client.send('CSS.enable');

  // Load the page.
  await page.goto(url, { waitUntil: 'load' });

  // Get the node ID for every node on the page.
  const document = await client.send('DOM.getDocument');
  const { nodeIds } = await client.send('DOM.querySelectorAll', {
    nodeId: document.root.nodeId,
    selector: '*',
  });

  // Look for order dependent styles for each node.
  let conflict = false;
  for (const nodeId of nodeIds) {
    const orderDependentStyles = findOrderDependentStyles(client, nodeId);
    for await (const [ specHash, prop, selectors ] of orderDependentStyles) {
      conflict = true;
      console.error(`
Conflict, multiple selectors set \`${prop}\` with the specificity \`${specHash}\` and are order-dependent as a result:
${selectors.map((selector) => `
Selector: ${selector.text}
URL: ${styleSheetMapping.get(selector.styleSheetId)?.sourceURL}
Span: Line ${selector.range?.startLine}, column ${selector.range?.startColumn} - line ${selector.range?.endLine}, column ${selector.range?.endColumn}
`.trim()).join('\n\n')}
      `.trim());
    }
  }

  await browser.close();

  // If any order-dependent styles are found, exit with code 1.
  return conflict ? 1 : 0;
})().then((status) => {
  process.exit(status);
}, (err) => {
  console.error(err.message);
  process.exit(1);
});

/**
 * Emits all the order dependent styles applied to the given node. Each result
 * is a single specificity which has multiple selectors. These selectors are
 * inherently order-dependent.
 */
async function* findOrderDependentStyles(
  client: CDPSession,
  nodeId: number,
): AsyncGenerator<[ specHash: string, prop: string, selectors: CSSValue[] ], void, void> {
  const styles = await client.send('CSS.getMatchedStylesForNode', { nodeId });

  // For every matched rule, map all its styles to the selectors which set them.
  const propToSelectorsMaps = styles.matchedCSSRules!
      .filter((match) => match.rule.origin === 'regular')
      .flatMap((match) => {
        // Get all the selectors which matched the node.
        const selectors = match.matchingSelectors
            .map((index) => match.rule.selectorList.selectors[index]);
        const selectorValues: CSSValue[] = selectors.map((selector) => ({
          ...selector,
          styleSheetId: match.rule.styleSheetId!,
        }));

        // Get all the properties set by each selector.
        const properties = match.rule.style.cssProperties.map((prop) => prop.name);

        // Aggregate everything into a map of property => selectors which set it.
        return new Map<string, CSSValue[]>(properties.map((prop) => [
          prop,
          selectorValues,
        ]));
      });

  // Merge all the style => selectors maps for all rules together.
  const propToSelectorsMap = new Map<string, CSSValue[]>();
  for (const map of propToSelectorsMaps) {
    for (const [ prop, selectors ] of map) {
      const set = propToSelectorsMap.get(prop) ?? [];
      for (const selector of selectors) {
        set.push(selector);
      }
      propToSelectorsMap.set(prop, set);
    }
  }

  // Look for a style which is set by multiple selectors of the same specificity.
  for (const [ prop, selectors ] of propToSelectorsMap) {
    // Map each selector with its specificity value.
    const specificityMap = new Map<string, CSSValue[]>();
    for (const selector of selectors) {
      const spec = specificity(selector.text);
      const specHash = hashSpecificity(spec);
      const selectorsForSpec = specificityMap.get(specHash) ?? [];
      selectorsForSpec.push(selector);
      specificityMap.set(specHash, selectorsForSpec);
    }

    // Find all specificities which have multiple selectors.
    for (const [ specHash, selectors ] of specificityMap) {
      // No conflict, ignore.
      if (selectors.length < 2) continue;

      // Found a specificity with multiple selectors, thus they are
      // order-dependent.
      yield [ specHash, prop, selectors ];
    }
  }
}

/** Compute the specificity for the givne selector. */
function specificity(selector: string): SpecificityArray {
  const specificities = calculateSpecificity(selector);
  if (specificities.length !== 1) {
    throw new Error(`Expected one specificity for selector "${selector}", but got ${specificities.length}`);
  }

  const { specificityArray: specificity } = specificities[0];
  return specificity;
}

function hashSpecificity(spec: SpecificityArray): string {
  const [ inline, ids, classes, tags ] = spec;
  return `${inline}-${ids}-${classes}-${tags}`;
}
