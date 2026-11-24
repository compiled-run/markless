// Rewrites conformance/*.json from the fixtures: `node packages/mobile/test/write-conformance.ts`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { APP_CONFORMANCE_CASES, CONFORMANCE_CASES } from './conformance-cases.ts';
import { appCaseVector, caseVector, CONFORMANCE_ENGINE_FILES } from './conformance-build.ts';
import { scrollVectors } from '../src/scroll.ts';
import { SCROLL_CASES } from './scroll-cases.ts';

const write = (name: string, value: unknown) =>
	writeFileSync(new URL(`../conformance/${name}`, import.meta.url), `${JSON.stringify(value, null, '\t')}\n`);

for (const entry of CONFORMANCE_CASES) write(`${entry.name}.json`, await caseVector(entry));
for (const entry of APP_CONFORMANCE_CASES) write(`${entry.name}.json`, await appCaseVector(entry));

mkdirSync(new URL('../conformance/engine/', import.meta.url), { recursive: true });
for (const [name, text] of Object.entries(CONFORMANCE_ENGINE_FILES))
	writeFileSync(new URL(`../conformance/${name}`, import.meta.url), text);

write('scroll/scroll-into-view.json', scrollVectors(SCROLL_CASES));
