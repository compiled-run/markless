// Draws the showcase cards' sketches into public/showcase/sketch/ from the committed showcase data.
// Run: node --experimental-strip-types scripts/showcase-sketch.ts
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { showcaseApps } from '../components/docs/showcase/apps.data.ts';
import { writeShowcaseSketches } from '../tooling/showcase-sketch.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const count = await writeShowcaseSketches(resolve(root, 'public/showcase/sketch'), showcaseApps);
console.log(`showcase-sketch: ${count} files written`);
