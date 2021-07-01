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
  } catch (error) {
    console.log(process.cwd());
    console.error(error);
    const err = error as ProcessResult & Error;
    return {
      status: err.status,
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

  afterAll(async () => {
    server.close();
  });

  it('detects order dependent styling', async () => {
    const { status, stdout, stderr } = await exec('/simple.html');

    expect(status).toBe(0);
    expect(stdout).toBe('Simple\n');
    expect(stderr).toBe('');
  });
});
