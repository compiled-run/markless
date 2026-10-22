// Freezes the migrate page's showcase data from a markless-migrate checkout.
// Run: node --experimental-strip-types scripts/showcase-data.ts [path to markless-migrate]
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildShowcase, renderShowcaseModule } from '../tooling/showcase-data.ts';
import { writeShowcaseInk } from '../tooling/showcase-ink.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultSource = resolve(root, '../../markless-migrate');
const source = resolve(process.argv[2] ?? process.env.MARKLESS_MIGRATE_DIR ?? defaultSource);
const out = resolve(root, 'components/docs/showcase/apps.data.ts');

const data = buildShowcase(source);
await writeFile(out, renderShowcaseModule(data));
await writeShowcaseInk(resolve(root, 'public/showcase/ink'), data);
console.log(`showcase-data: ${data.length} apps written to ${out}, with their card ink`);
