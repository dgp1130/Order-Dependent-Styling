#! /usr/bin/env node
import puppeteer from 'puppeteer';

(async () => {
  const url = process.argv[2];
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto(url);

  console.log(await page.title());

  await browser.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
