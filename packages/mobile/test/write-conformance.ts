// Rewrites conformance/*.json from the fixtures: `node packages/mobile/test/write-conformance.ts`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileNativeComponent, nativeAppConformance, nativeConformance } from '../src/index.ts';
import { compileRungApp, readWorkspaceModule } from '../src/harness/rung.ts';
import { APP_CONFORMANCE_CASES, CONFORMANCE_CASES, CONFORMANCE_SCRIPT_HOST } from './conformance-cases.ts';

for (const entry of CONFORMANCE_CASES) {
	const source = readFileSync(join(import.meta.dirname, '..', entry.fixture), 'utf8');
	const { payload, diagnostics } = await compileNativeComponent({
		filename: entry.modules ? `packages/mobile/${entry.fixture}` : `src/${entry.name}.tsrx`,
		...(entry.page ? { page: entry.page } : {}),
		...(entry.device ? { device: entry.device } : {}),
		...(entry.modules ? { readModule: readWorkspaceModule } : {}),
		source,
	});
	if (!payload)
		throw new Error(`${entry.fixture}: ${diagnostics.map((d) => d.message).join('; ')}`);
	const file = new URL(`../conformance/${entry.name}.json`, import.meta.url);
	writeFileSync(
		file,
		`${JSON.stringify(nativeConformance(payload, entry.actions, entry.params, CONFORMANCE_SCRIPT_HOST()), null, '\t')}\n`,
	);
}

for (const entry of APP_CONFORMANCE_CASES) {
	const { payload, diagnostics } = await compileRungApp(join(import.meta.dirname, '..', entry.app));
	if (!payload) throw new Error(`${entry.app}: ${diagnostics.map((d) => d.message).join('; ')}`);
	writeFileSync(
		new URL(`../conformance/${entry.name}.json`, import.meta.url),
		`${JSON.stringify(nativeAppConformance(payload, entry.open, entry.actions, CONFORMANCE_SCRIPT_HOST()), null, '\t')}\n`,
	);
}
