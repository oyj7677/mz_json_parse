import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const source = resolve(webRoot, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js');
const targetDir = resolve(webRoot, 'public', 'vendor');
const target = resolve(targetDir, 'xlsx.full.min.js');

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);
console.log(`Copied ${source} -> ${target}`);
