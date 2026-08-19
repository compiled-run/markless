import { expect, test } from 'vitest';
import { createMarklessDevGraph } from '../src/dev.ts';
import { invalidateEditedGeneratedModules } from '../src/dev-invalidation.ts';
import type { MarklessHookContext } from '../src/hooks/hook-context.ts';
import { createPluginState } from '../src/plugin-state.ts';
import { transformTsrxModuleWithPrerenderWakeClosure } from '../src/transform.ts';
import type { TransformTsrxModuleInput } from '../src/types.ts';

const source = '/workspace/app/src/Panel.tsrx';
// No browser trigger of its own: the capability under test is the one an
// imported child contributed, which only one of the two cache entries carries.
const code = `export function Panel() @{ <p>Ready</p> }`;

function hookContext(state: ReturnType<typeof createPluginState>): MarklessHookContext {
	return {
		state,
		internalOptions: { dev: true },
		dev: createMarklessDevGraph(),
		environment: 'client',
		linkedChildren: new Map(),
		getEnvironment: () => 'client',
		getRoot: () => '/workspace/app',
		attributionTables: () => ({}) as never,
	} as unknown as MarklessHookContext;
}

test('two cache entries for one source fold instead of overwriting each other', async () => {
	const state = createPluginState();
	for (const [environment, linkedChildHasBrowserTriggers] of [
		['client', true],
		['ssr', false],
	] as const) {
		const input: TransformTsrxModuleInput = {
			filename: source,
			source: code,
			environment: environment === 'client' ? 'client' : 'server',
		};
		state.linkedTransformCache.set(`${environment}\0${source}`, {
			source,
			manifestSource: environment === 'client' ? source : `${source}?markless-symbols`,
			code,
			importedInterfaceHashes: '',
			importedSymbolClaims: '',
			input,
			result: await transformTsrxModuleWithPrerenderWakeClosure(
				input,
				linkedChildHasBrowserTriggers,
			),
			linkedChildHasBrowserTriggers,
		});
	}

	// No current environment: every cached entry for this source is refreshed in
	// one pass, and the second one used to erase what the first recorded.
	await invalidateEditedGeneratedModules(hookContext(state), source, undefined, code);

	expect(state.prerenderWakeCapabilities.get(source)).toBe(true);
	expect(state.moduleLinkArtifacts.has(source)).toBe(true);
});
