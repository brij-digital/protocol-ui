import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const NPMRC_PATH = path.join(ROOT, '.npmrc');
const ALLOWED_LINES = new Set(['install-links=false']);

function fail(message) {
  throw new Error(message);
}

async function main() {
  let raw = '';
  try {
    raw = await fs.readFile(NPMRC_PATH, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.log('.npmrc check: no local override file present.');
      return;
    }
    throw error;
  }

  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith(';'));

  for (const line of lines) {
    if (line.includes('_authToken') || line.includes('NODE_AUTH_TOKEN') || line.includes('npm.pkg.github.com')) {
      fail(`.npmrc must not contain local auth or registry overrides: ${line}`);
    }
    if (!ALLOWED_LINES.has(line)) {
      fail(`.npmrc contains an unsupported local override: ${line}`);
    }
  }

  console.log('.npmrc check: local overrides are clean.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
