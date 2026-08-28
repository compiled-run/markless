import { expect, test } from 'vitest';
import { marklessSsrComponentPart } from '@markless/web/fns/ssr';
import { renderToString } from '@markless/web/render-to-string';
import { transformTsrxModule } from '../src/transform.ts';
import { MARKLESS_SHARED_CALL_UNCOMPILED } from '../src/source-module.ts';

// Plain ESM has to reach the components of a compiled `.tsrx` module. Two shapes
// do it, and both are resolved by the bundler at LINK time, before anything
// runs:
//
//   import { Gallery } from './Gallery.tsrx';   // an app entry renders it
//   export { CheckboxRoot as root } from './checkbox.tsrx';  // a .ts barrel
//
// Publishing components only on the default export's `renderSsrComponents` map
// answered neither: the barrel failed the build with MISSING_EXPORT and the
// browser reported "does not provide an export named". These pin the emitted
// exports, in every environment variant, and the two consumer shapes they have
// to satisfy at once.

const FAMILY = `
import { shared, state } from '@markless/core';

export const sel = shared(() => {
	const s = state({ open: false });
	return { ...s, toggle() { s.open = !s.open; } };
}, { scope: 'widget' });

export function Root({ children }) @{
	const s = sel();
	<div data-sel-root ui-open={s.open}>{children}</div>
}

export function Trigger() @{
	const s = sel();
	<button type="button" data-sel-trigger onClick={() => s.toggle()}>Toggle</button>
}
`;

const SOLO = `export function Solo() @{\n\t<main>Hi</main>\n}`;

type Variant = Parameters<typeof transformTsrxModule>[0];

async function emit(source: string, options: Partial<Variant> = {}) {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/sel.tsrx',
		source,
		...options,
	} as Variant);
	return result.code;
}

/** Every name this emitted module declares at module scope, in source order. */
function moduleDeclarations(code: string): ReadonlyArray<string> {
	return [
		...code.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm),
	].map((match) => match[1]!);
}

/** Every name this emitted module publishes, in source order. */
function moduleExportNames(code: string): ReadonlyArray<string> {
	return [
		...code.matchAll(
			/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)|^export\s*\{\s*([^}]*)\}/gm,
		),
	].flatMap((match) =>
		match[1]
			? [match[1]]
			: (match[2] ?? '')
					.split(',')
					.map((clause) => clause.trim().split(/\s+as\s+/).pop()!.trim())
					.filter(Boolean),
	);
}

/**
 * The published exports, evaluated against a stand-in for the module's own
 * compiled-app object. The emitted expressions read that object the same way a
 * loaded module would, so this exercises the real binding, not a copy of it.
 */
function publishedExports(code: string, compiledApp: unknown): Record<string, unknown> {
	const published: Record<string, unknown> = {};
	for (const match of code.matchAll(/^export const (\w+) = /gm)) {
		const start = match.index + match[0].length;
		published[match[1]!] = new Function(
			'marklessCompiledApp',
			`return (${initializerAt(code, start)});`,
		)(compiledApp);
	}
	return published;
}

/**
 * The initializer expression starting at `start`, up to the `;` that ends the
 * declaration. Scanned with nesting and string depth rather than matched to the
 * first `;`: a published binding whose body is a block (the shared-definition
 * export throws from one) carries semicolons of its own, and a lazy regex stops
 * inside it and hands `new Function` a fragment.
 */
function initializerAt(code: string, start: number): string {
	let depth = 0;
	let quote: string | null = null;
	for (let index = start; index < code.length; index += 1) {
		const character = code[index]!;
		if (quote) {
			if (character === '\\') index += 1;
			else if (character === quote) quote = null;
			continue;
		}
		if (character === "'" || character === '"' || character === '`') quote = character;
		else if ('([{'.includes(character)) depth += 1;
		else if (')]}'.includes(character)) depth -= 1;
		else if (character === ';' && depth === 0) return code.slice(start, index);
	}
	throw new Error(`Unterminated export initializer at ${start}:\n${code.slice(start)}`);
}

function compiledAppStub() {
	const renderSsrRoot = Object.assign(() => ({ html: '<root>' }), {
		marklessWidgetRoots: ['sel'],
	});
	const renderSsrTrigger = () => ({ html: '<trigger>' });
	return {
		renderData: { root: 'sel' },
		loadSymbol: () => undefined,
		renderSsr: () => renderSsrRoot(),
		renderSsrComponents: {
			Root: { renderSsr: renderSsrRoot },
			Trigger: { renderSsr: renderSsrTrigger },
		},
		renderSsrRoot,
		renderSsrTrigger,
	};
}

test('every component a module serves is a real ES named export, in every variant', async () => {
	for (const options of [
		{},
		{ environment: 'server' as const },
		{ environment: 'client' as const },
		{ environment: 'client' as const, dev: true },
		{ environment: 'client' as const, prerenderRecords: true },
	]) {
		const code = await emit(FAMILY, options);
		expect(code, JSON.stringify(options)).toMatch(/^export const Root = /m);
		expect(code, JSON.stringify(options)).toMatch(/^export const Trigger = /m);
	}
});

test('no variant binds a published name twice', async () => {
	// A client development build and a library build carry the direct render
	// module AND the SSR module in one file. A published name that the direct
	// module already declared would be a duplicate declaration - a SyntaxError
	// at load, after a build that reported success.
	for (const source of [FAMILY, SOLO]) {
		for (const options of [
			{},
			{ environment: 'server' as const },
			{ environment: 'client' as const },
			{ environment: 'client' as const, dev: true },
			{ environment: 'client' as const, prerenderRecords: true },
			{ environment: 'client' as const, clientOutput: 'symbols-only' as const },
		]) {
			const code = await emit(source, options);
			for (const names of [moduleDeclarations(code), moduleExportNames(code)]) {
				expect(new Set(names).size, `${JSON.stringify(options)}: ${names}`).toBe(
					names.length,
				);
			}
		}
	}
});

test('the root is published merged, so a named import can be rendered AND composed', async () => {
	// `render(Gallery, { target })` reads the module surface - renderCsr, else
	// renderData, else renderSsr, with loadSymbol alongside (packages/web/src/
	// render.ts and render-canonical.ts). A member tag reaching the same name
	// through a barrel reads the PART. The root has to answer both by that one
	// name, so it is published as the surface with its own part's renderSsr.
	const stub = compiledAppStub();
	const published = publishedExports(await emit(FAMILY, { environment: 'server' }), stub);
	const root = published.Root as Record<string, unknown>;

	expect(root.renderData).toBe(stub.renderData);
	expect(root.loadSymbol).toBe(stub.loadSymbol);
	// The part's own function, not the surface's `renderSsr(props, context)`
	// wrapper: the compose seams read `marklessWidgetRoots` and the other build
	// time marks off the function itself, and a wrapper carries none of them.
	expect(root.renderSsr).toBe(stub.renderSsrRoot);
	expect((root.renderSsr as { marklessWidgetRoots?: unknown }).marklessWidgetRoots).toEqual([
		'sel',
	]);
});

test('a barrel re-export composes as the part the module publishes it as', async () => {
	// `export { Trigger as trigger } from './sel.tsrx'` in a .ts barrel, then
	// `<sel.trigger />`: the tag resolves through the barrel to this binding and
	// asks it for the part it declared. Binding a non-root name to the module
	// surface would render the ROOT there without saying so.
	const stub = compiledAppStub();
	const published = publishedExports(await emit(FAMILY, { environment: 'server' }), stub);

	// The published binding is the part plus the brand that lets the render path
	// refuse it AS A PAGE; what composition reads off it is the part's own function.
	expect((published.Trigger as { renderSsr?: unknown }).renderSsr).toBe(
		stub.renderSsrComponents.Trigger.renderSsr,
	);
	expect(published.Trigger).toMatchObject({ marklessComponentPart: 'Trigger' });
	expect(marklessSsrComponentPart(published.Trigger as never, 'Trigger')?.renderSsr).toBe(
		stub.renderSsrComponents.Trigger.renderSsr,
	);
	// The merged root still carries the map, so a barrel that re-exports the root
	// and composes a sibling part off it resolves that sibling too.
	expect(marklessSsrComponentPart(published.Root as never, 'Trigger')).toBe(
		stub.renderSsrComponents.Trigger,
	);
});

// A bare part has none of the module surface, so a page rendered from one is
// served complete and INERT: no resume module, so no client runtime is ever
// fetched and no gesture on it can dispatch. It is refused instead.
test('rendering a published non-root part AS A PAGE is refused; the root is not', async () => {
	const stub = compiledAppStub();
	const published = publishedExports(await emit(FAMILY, { environment: 'server' }), stub);

	await expect(renderToString(published.Trigger as never)).rejects.toThrow(
		/MARKLESS_COMPONENT_PART_AS_PAGE: "Trigger"/,
	);
	expect(await renderToString(published.Root as never)).toContain('<root>');
});

test('a client production build publishes the root as its client render surface', async () => {
	// SSR is dropped there, so the surface is the CSR one: renderData for a
	// canonical client mount, renderCsr for a direct one. That is exactly what
	// `import { Gallery } from './Gallery.tsrx'; render(Gallery, { target })`
	// needs, and it is the shape the screen reader gallery builds against.
	const family = await emit(FAMILY, { environment: 'client' });
	expect(family).not.toContain('renderSsrComponents');
	expect(family).toMatch(/^export const Root = marklessCompiledApp;$/m);

	const solo = await emit(SOLO, { environment: 'client' });
	expect(solo).toMatch(/^export const Solo = marklessCompiledApp;$/m);
	expect(solo).toContain('renderCsr: marklessCsrSolo');
});

test('a non-root part a client production build cannot serve is published inert', async () => {
	// Nothing on a CSR-only surface renders one named part: renderData and
	// renderCsr are the ROOT's. The name still has to link, so it is published
	// carrying no render entry at all - composing it raises
	// MARKLESS_SSR_DATA_CHILD_RENDER_MISSING and rendering it raises the missing
	// canonical surface TypeError, instead of quietly rendering the root.
	const stub = compiledAppStub();
	const published = publishedExports(await emit(FAMILY, { environment: 'client' }), stub);

	expect(published.Trigger).toEqual({
		marklessCsrOnlyPart: 'Trigger',
		marklessComponentPart: 'Trigger',
	});
	expect(marklessSsrComponentPart(published.Trigger as never, 'Trigger')).toBe(
		published.Trigger,
	);
	expect((published.Trigger as { renderSsr?: unknown }).renderSsr).toBeUndefined();
});

test('an authored shared definition stays a real named export of the compiled module', async () => {
	// `export const sel = shared(...)` is authored source the emitted module
	// replaces wholesale, so without this wiring a `.ts` barrel writing
	// `export { sel as state } from './sel.tsrx'` failed to LINK — a SyntaxError
	// before anything ran. The compiler publishes the name on the module-graph
	// interface's `sharedDefinitions`; this pins that the bundler reads it there
	// and hands it to the emitter, in every variant a barrel can link against.
	for (const options of [
		{},
		{ environment: 'server' as const },
		{ environment: 'client' as const },
		{ environment: 'client' as const, dev: true },
		{ environment: 'client' as const, prerenderRecords: true },
		{ environment: 'client' as const, clientOutput: 'symbols-only' as const },
	]) {
		const code = await emit(FAMILY, options);
		expect(code, JSON.stringify(options)).toMatch(/^export const sel = /m);
	}
});

test('the published shared binding refuses an uncompiled call by name', async () => {
	// A compiled consumer's `family.state()` is lowered by the compiler and never
	// reaches this binding, so anything that DOES reach it is an uncompiled call
	// site — there is no widget to resolve the instance against. It throws rather
	// than becoming a second, unratified way to run a shared definition.
	const published = publishedExports(await emit(FAMILY, { environment: 'server' }), {
		...compiledAppStub(),
	});
	const sel = published.sel as () => unknown;

	expect(typeof sel).toBe('function');
	expect(() => sel()).toThrow(MARKLESS_SHARED_CALL_UNCOMPILED);
	expect(() => sel()).toThrow(/\bsel\b/);
	expect(() => sel()).toThrow(/this call site was not compiled/);
});

test('a component exported under a name this module already binds is a loud error', async () => {
	// Fail closed: the alternative is an emitted module that throws SyntaxError
	// at load, long after the build said it succeeded.
	await expect(
		emit(`export function payloadView() @{\n\t<main>Hi</main>\n}`, {
			environment: 'server',
		}),
	).rejects.toThrow('MARKLESS_COMPONENT_EXPORT_NAME_RESERVED: payloadView');
});
