// Rewrites conformance/*.json from the fixtures: `node packages/mobile/test/write-conformance.ts`.
import { readFileSync, writeFileSync } from 'node:fs';
import { compileNativeComponent, nativeConformance } from '../src/index.ts';
import { CONFORMANCE_CASES } from './conformance-cases.ts';

for (const entry of CONFORMANCE_CASES) {
	const source = readFileSync(new URL(`./fixtures/${entry.fixture}`, import.meta.url), 'utf8');
	const { payload, diagnostics } = await compileNativeComponent({ filename: `src/${entry.fixture}`, source });
	if (!payload) throw new Error(`${entry.fixture}: ${diagnostics.map((d) => d.message).join('; ')}`);
	const file = new URL(`../conformance/${entry.name}.json`, import.meta.url);
	writeFileSync(file, `${JSON.stringify(nativeConformance(payload, entry.actions), null, '\t')}\n`);
}
