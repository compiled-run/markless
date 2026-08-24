import { mkdirSync, writeFileSync } from 'node:fs';
import { manifestJson } from './extract.ts';

const target = new URL('../api/manifest.json', import.meta.url);
mkdirSync(new URL('../api/', import.meta.url), { recursive: true });
writeFileSync(target, manifestJson());
process.stdout.write(`wrote ${target.pathname}\n`);
