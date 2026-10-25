import { expect, test } from 'vitest';
import { marklessRuntimeSpecifierId } from '../src/build/delegate-loader.ts';
import type { MarklessHookContext } from '../src/hooks/hook-context.ts';
import { resolveIdHook } from '../src/hooks/resolve-load.ts';

// An emitted runtime import lands in the dev optimizer's bundle whenever the resume entries do.
const SPECIFIER = '@markless/web/fns/instance-scope';
const OPTIMIZED = '/app/node_modules/.vite/deps/@markless_core___@markless_web_fns_instance-scope.js';

const hookContext = { state: { importedChildSources: new Set() } } as unknown as MarklessHookContext;

function pluginContext(optimized: boolean) {
	const asked: Array<readonly [string, string | undefined]> = [];
	return {
		asked,
		context: {
			environment: {
				depsOptimizer: { isOptimizedDepFile: (id: string) => id.includes('/.vite/deps/') },
			},
			async resolve(source: string, importer?: string) {
				asked.push([source, importer]);
				return { id: optimized ? `${OPTIMIZED}?v=1` : `${importer}?v=1` };
			},
		} as never,
	};
}

test('a runtime import the optimizer bundled resolves to the bundled module', async () => {
	const { asked, context } = pluginContext(true);
	expect(await resolveIdHook(hookContext, context, SPECIFIER, '/app/pages/a.tsrx')).toEqual({
		id: `${OPTIMIZED}?v=1`,
	});
	expect(asked).toEqual([[SPECIFIER, marklessRuntimeSpecifierId(SPECIFIER)]]);
});

test('a runtime import the optimizer left out resolves to its own file', async () => {
	const { context } = pluginContext(false);
	expect(await resolveIdHook(hookContext, context, SPECIFIER, '/app/pages/a.tsrx')).toEqual({
		id: marklessRuntimeSpecifierId(SPECIFIER),
	});
});

test('without a dev optimizer a runtime import resolves to its own file', async () => {
	const context = { resolve: () => Promise.reject(new Error('not asked')) } as never;
	expect(await resolveIdHook(hookContext, context, SPECIFIER, '/app/pages/a.tsrx')).toEqual({
		id: marklessRuntimeSpecifierId(SPECIFIER),
	});
});

test('a runtime import the optimizer can never hold is not resolved through it', async () => {
	const inline = '@markless/web/inline/sync-policy-core-lazy';
	const { asked, context } = pluginContext(true);
	expect(await resolveIdHook(hookContext, context, inline, '/app/pages/a.tsrx')).toEqual({
		id: marklessRuntimeSpecifierId(inline),
	});
	expect(asked).toEqual([]);
});
