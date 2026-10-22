// Draws the showcase cards' ink into public/showcase/ink/ from the committed showcase data.
// Run: node --experimental-strip-types scripts/showcase-ink.ts
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { showcaseApps } from '../components/docs/showcase/apps.data.ts';
import { writeShowcaseInk } from '../tooling/showcase-ink.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const count = await writeShowcaseInk(resolve(root, 'public/showcase/ink'), showcaseApps);
console.log(`showcase-ink: ${count} files written`);
