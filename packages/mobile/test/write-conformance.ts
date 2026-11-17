// Rewrites conformance/*.json from the fixtures: `node packages/mobile/test/write-conformance.ts`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileNativeComponent, nativeConformance } from '../src/index.ts';
import { CONFORMANCE_CASES } from './conformance-cases.ts';

for (const entry of CONFORMANCE_CASES) {
	const source = readFileSync(join(import.meta.dirname, '..', entry.fixture), 'utf8');
	const { payload, diagnostics } = await compileNativeComponent({
		filename: `src/${entry.name}.tsrx`,
				...(entry.page ? { page: entry.page } : {}),
		source,
	});
	if (!payload)
		throw new Error(`${entry.fixture}: ${diagnostics.map((d) => d.message).join('; ')}`);
	const file = new URL(`../conformance/${entry.name}.json`, import.meta.url);
	writeFileSync(
		file,
		`${JSON.stringify(nativeConformance(payload, entry.actions, entry.params), null, '\t')}\n`,
	);
}
