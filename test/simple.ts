import 'jasmine';

import { Server } from 'http';
import { createServer } from 'http-server';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

const port = 8000;

interface ProcessResult {
  status: number;
  stdout: string;
  stderr: string;
}

async function exec(path: string): Promise<ProcessResult> {
  if (!path.startsWith('/')) throw new Error(`Path must start with a slash: ${path}`);

  try {
    const { stdout, stderr } = await execFile('dist/index.js', [
      `http://localhost:${port}${path}`,
    ]);
    return {
      status: 0,
      stdout,
      stderr,
    };
  } catch (err) {
    return {
      status: err.code,
      stdout: err.stdout,
      stderr: err.stderr,
    };
  }
}

describe('Dependent Styling', () => {
  let server: Server;

  beforeAll(() => {
    server = createServer({ root: 'site/' });
    server.listen(8000, () => {
      console.log('Listening');
    });
  });

  afterAll(() => {
    server.close();
  });

  it('detects order dependent styling', async () => {
    const { status, stdout, stderr } = await exec('/simple.html');

    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toBe(`
Conflict, multiple selectors set \`color\` with the specificity \`0-0-0-1\` and are order-dependent as a result:
Selector: p
URL: http://localhost:8000/simple.css
Span: Line 0, column 0 - line 0, column 1

Selector: p
URL: http://localhost:8000/simple.css
Span: Line 4, column 0 - line 4, column 1
    `.trim() + '\n');
  });
});
