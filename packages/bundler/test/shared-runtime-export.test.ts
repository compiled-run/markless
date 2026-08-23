import { expect, test } from 'vitest';
import {
	emitSourceModule,
	MARKLESS_SHARED_CALL_UNCOMPILED,
	type SourceSymbolRow,
} from '../src/source-module.ts';

// A compiled `.tsrx` module has to keep its authored shared-definition exports
// at runtime. The emitted module replaces the authored one wholesale, so
// `export const nscShared = shared(...)` vanished, and a `.ts` barrel writing
// `export { nscShared as state } from './family.tsrx'` failed to LINK — a
// SyntaxError before anything ran, not a wrong value at runtime.
//
// The binding that answers the link is deliberately inert. A compiled consumer's
// `family.state()` is lowered by the compiler and never reaches it, so any call
// that DOES reach it came from a module nobody compiled, and there is no widget
// to resolve the instance against. It throws by name instead of inventing a
// second, unratified way to run a shared definition.

const baseInput = {
	filename: '/workspace/app/src/family.tsrx',
	payloadId: 'virtual:markless:payload:/workspace/app/src/family.tsrx',
	resolverId: 'virtual:markless:resolver:/workspace/app/src/family.tsrx',
	environment: 'client' as const,
	clientOutput: 'full' as const,
	publicRenderModuleSource: '',
	publicRenderRootExportName: null,
	publicSsrModuleSource: 'export function marklessRenderSsr() { return null; }',
	publicRenderSsrExportName: 'marklessRenderSsr',
	publicRenderSsrComponentExports: [
		{ exportName: 'Root', ssrFunctionName: 'marklessRenderSsr' },
		{ exportName: 'Trigger', ssrFunctionName: 'marklessSsrRenderTrigger' },
	],
	renderDataId: 'virtual:markless:render-data:/workspace/app/src/family.tsrx',
	symbols: [] as ReadonlyArray<SourceSymbolRow>,
	symbolRoutes: [],
};

/** The emitted binding itself, evaluated the way a linked module would get it. */
function sharedExportBinding(code: string, name: string): () => unknown {
	const match = new RegExp(`^export const ${name} = (.*);$`, 'm').exec(code);
	if (!match) throw new Error(`Emitted module publishes no shared export ${name}:\n${code}`);
	return new Function(`return ${match[1]}`)() as () => unknown;
}

test('an authored shared definition stays a real named export of the emitted module', () => {
	const code = emitSourceModule({ ...baseInput, sharedDefinitionExports: ['nscShared'] });

	// The link the barrel needs: a real ES named export, not a key on the default.
	expect(code).toMatch(/^export const nscShared = /m);
	// The parts keep their own exports; the shared export is additive.
	expect(code).toContain('export const Root =');
	expect(code).toContain('export const Trigger =');
});

test('calling the exported shared binding throws the named uncompiled-call error', () => {
	const code = emitSourceModule({ ...baseInput, sharedDefinitionExports: ['nscShared'] });

	const binding = sharedExportBinding(code, 'nscShared');
	expect(typeof binding).toBe('function');
	expect(() => binding()).toThrow(MARKLESS_SHARED_CALL_UNCOMPILED);
	expect(() => binding()).toThrow(/nscShared/);
	expect(() => binding()).toThrow(/this call site was not compiled/);
});

test('the shared export is published in every build variant a barrel can link against', () => {
	for (const variant of [
		{ environment: 'server' as const, clientOutput: 'full' as const },
		{ environment: 'client' as const, clientOutput: 'full' as const },
		{ environment: 'client' as const, clientOutput: 'symbols-only' as const },
		{ environment: 'lib' as const, clientOutput: 'full' as const },
	]) {
		const code = emitSourceModule({
			...baseInput,
			...variant,
			sharedDefinitionExports: ['nscShared'],
		});
		expect(code, `${variant.environment}/${variant.clientOutput}`).toMatch(
			/^export const nscShared = /m,
		);
	}
});

test('a module with no shared definitions emits nothing extra', () => {
	const withNone = emitSourceModule({ ...baseInput, sharedDefinitionExports: [] });
	expect(withNone).toBe(emitSourceModule(baseInput));
	expect(withNone).not.toContain(MARKLESS_SHARED_CALL_UNCOMPILED);
});

test('a shared export name the emitted module already binds is a loud build error', () => {
	// Collides with a component export published from the same module.
	expect(() =>
		emitSourceModule({ ...baseInput, sharedDefinitionExports: ['Root'] }),
	).toThrow('MARKLESS_SHARED_EXPORT_NAME_RESERVED: Root');
	// Collides with a binding the emitted module declares for its own plumbing.
	expect(() =>
		emitSourceModule({ ...baseInput, sharedDefinitionExports: ['loadSymbol'] }),
	).toThrow('MARKLESS_SHARED_EXPORT_NAME_RESERVED: loadSymbol');
	// Collides with another shared export of the same module.
	expect(() =>
		emitSourceModule({ ...baseInput, sharedDefinitionExports: ['nscShared', 'nscShared'] }),
	).toThrow('MARKLESS_SHARED_EXPORT_NAME_RESERVED: nscShared');
});
