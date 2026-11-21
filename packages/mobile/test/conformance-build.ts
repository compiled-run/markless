// A vector's payload carries markers where the engine text goes, so an engine change that keeps every journal leaves the
// vectors as they are; conformance/engine/*.js holds the engine text, and the hosts' conformance tests put it back.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NATIVE_SCRIPT_ENGINE, type NativeScriptEngine } from '@markless/compiler/native';
import { compileNativeComponent, nativeAppConformance, nativeConformance } from '../src/index.ts';
import { compileRungApp, readWorkspaceModule } from '../src/harness/rung.ts';
import {
	type APP_CONFORMANCE_CASES,
	type CONFORMANCE_CASES,
	CONFORMANCE_SCRIPT_HOST,
	readCaseModule,
} from './conformance-cases.ts';

export const CONFORMANCE_ENGINE_MARKERS: NativeScriptEngine = {
	services: '/*markless-engine:services*/',
	entries: '/*markless-engine:entries*/',
};

/** The engine files beside the vectors, by path under conformance/. */
export const CONFORMANCE_ENGINE_FILES: Readonly<Record<string, string>> = {
	'engine/services.js': `${NATIVE_SCRIPT_ENGINE.services}\n`,
	'engine/entries.js': `${NATIVE_SCRIPT_ENGINE.entries}\n`,
};

/** A component case's vector: journals from the real engine, the payload written with the markers. */
export async function caseVector(entry: (typeof CONFORMANCE_CASES)[number]) {
	const compile = (scriptEngine?: NativeScriptEngine) =>
		compileNativeComponent({
			filename: entry.modules ? `packages/mobile/${entry.fixture}` : `src/${entry.name}.tsrx`,
			...(entry.page ? { page: entry.page } : {}),
			...(entry.device ? { device: entry.device } : {}),
			source: readFileSync(join(import.meta.dirname, '..', entry.fixture), 'utf8'),
			readModule: entry.modules ? readWorkspaceModule : readCaseModule,
			...(scriptEngine ? { scriptEngine } : {}),
		});
	const real = await compile();
	if (!real.payload)
		throw new Error(`${entry.fixture}: ${real.diagnostics.map((d) => d.message).join('; ')}`);
	const marked = (await compile(CONFORMANCE_ENGINE_MARKERS)).payload!;
	return {
		...nativeConformance(real.payload, entry.actions, entry.params, entry.preferredLanguages, entry.now, CONFORMANCE_SCRIPT_HOST()),
		payload: marked,
	};
}

/** An app case's vector, the same way. */
export async function appCaseVector(entry: (typeof APP_CONFORMANCE_CASES)[number]) {
	const dir = join(import.meta.dirname, '..', entry.app);
	const real = await compileRungApp(dir);
	if (!real.payload)
		throw new Error(`${entry.app}: ${real.diagnostics.map((d) => d.message).join('; ')}`);
	const marked = (await compileRungApp(dir, { scriptEngine: CONFORMANCE_ENGINE_MARKERS })).payload!;
	return {
		...nativeAppConformance(real.payload, entry.open, entry.actions, CONFORMANCE_SCRIPT_HOST()),
		app: marked,
	};
}
