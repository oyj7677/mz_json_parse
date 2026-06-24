import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const vendorDir = join(__dirname, '..', 'public', 'vendor');

const source = require.resolve('vanilla-jsoneditor/standalone.js');
const destination = join(vendorDir, 'vanilla-jsoneditor.js');

await mkdir(vendorDir, { recursive: true });
await copyFile(source, destination);

console.log(`Copied ${source} to ${destination}`);
