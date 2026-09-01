import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// Every id the compiler mints from where a module lives - shared definition ids,
// storage ids, element ids and the IDREFs that name them, the render-data record,
// the scope class - is spelled from the root-relative `moduleId`, never from the
// absolute `filename`. The filename stays absolute for diagnostics only.

const MACHINE_ROOT = '/Users/someone/dev/site';
const FILENAME = `${MACHINE_ROOT}/src/Widget.tsrx`;
const MODULE_ID = 'src/Widget.tsrx';

const WIDGET = `
import { computed, element, shared, state, storage } from '@markless/core';

export let theme = storage('theme', 'light');

export const widgetState = shared(() => {
	const s = state({ open: false, label: 'a' });
	const loud = computed(() => s.label.toUpperCase());
	return { ...s, loud };
}, { scope: 'widget' });

export default function Widget() @{
	const w = widgetState();
	const panel = element<HTMLDivElement>();
	<div class="root" data-theme={theme}>
		<button aria-controls={panel} onClick={() => (w.open = !w.open)}>{w.loud}</button>
		<div el={panel} class="panel">{w.label}</div>
		<style>
			.root { color: red; }
			.panel { display: none; }
		</style>
	</div>
}
`;

function emitted(compiled: Awaited<ReturnType<typeof compileTsrxModule>>) {
	return JSON.stringify({
		state: compiled.protocolState,
		view: compiled.protocolView,
		renderData: compiled.renderData,
		styleScopes: compiled.publicRenderPlan.styleScopes,
		moduleSource: compiled.publicRenderModule.moduleSource,
		ssrModuleSource: compiled.publicRenderModule.ssrModuleSource,
		renderDataModuleSource: compiled.publicRenderModule.renderDataModuleSource,
		symbolModules: compiled.symbolModules.modules.map((module) => module.source),
		resolver: compiled.symbolResolverModule,
	});
}

test('every minted id is spelled from the module id, and nothing emitted carries the machine path', async () => {
	const compiled = await compileTsrxModule({
		filename: FILENAME,
		moduleId: MODULE_ID,
		source: WIDGET,
		symbols: [],
	});

	expect(compiled.semanticGraph.diagnostics).toEqual([]);
	expect(compiled.semanticGraph.sharedDefinitions.map((definition) => definition.id)).toEqual([
		`shared:${MODULE_ID}#widgetState`,
	]);
	expect(
		compiled.semanticGraph.graphBindings.find((binding) => binding.storage)?.id,
	).toBe(`storage:${MODULE_ID}#theme`);
	expect(compiled.renderData.filename).toBe(MODULE_ID);
	expect(emitted(compiled)).not.toContain(MACHINE_ROOT);
	// Diagnostics still point at the file on disk.
	expect(compiled.semanticGraph.filename).toBe(FILENAME);
	expect(compiled.semanticGraph.sharedDefinitions[0]?.sourceSpan?.filename).toBe(FILENAME);
});

test('the same module id from two machines mints byte-identical ids and scope class', async () => {
	const here = await compileTsrxModule({
		filename: FILENAME,
		moduleId: MODULE_ID,
		source: WIDGET,
		symbols: [],
	});
	const elsewhere = await compileTsrxModule({
		filename: `/home/ci/build/src/Widget.tsrx`,
		moduleId: MODULE_ID,
		source: WIDGET,
		symbols: [],
	});

	expect(elsewhere.publicRenderPlan.styleScopes[0]?.scopeId).toMatch(/^mk-[a-z0-9]+$/);
	expect(elsewhere.publicRenderPlan.styleScopes).toEqual(here.publicRenderPlan.styleScopes);
	expect(elsewhere.protocolState).toEqual(here.protocolState);
	expect(elsewhere.protocolView).toEqual(here.protocolView);
	expect(elsewhere.publicRenderModule.ssrModuleSource).toBe(
		here.publicRenderModule.ssrModuleSource,
	);
});

test('a caller that passes no module id keeps the filename as the id', async () => {
	const compiled = await compileTsrxModule({ filename: FILENAME, source: WIDGET, symbols: [] });

	expect(compiled.semanticGraph.sharedDefinitions.map((definition) => definition.id)).toEqual([
		`shared:${FILENAME}#widgetState`,
	]);
	expect(compiled.renderData.filename).toBe(FILENAME);
});

const HELPERS = `
export function shout(text) { return String(text).toUpperCase(); }
`;

const FAMILY = `
import { shared, state, computed } from '@markless/core';
import { shout } from './helpers.ts';

export const box = shared(() => {
	const s = state({ label: 'a' });
	const loud = computed(() => shout(s.label));
	return { ...s, loud };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.loud}</div>
}
`;

const PAGE = `
import { box } from '@acme/ui/src/box.tsrx';

export default function Page() @{
	const b = box();
	<div>{b.loud}</div>
}
`;

test('a factory computed copied out of a dependency rebases its imports between module ids, not filenames', async () => {
	const dependency = `${MACHINE_ROOT}/node_modules/.pnpm/@acme+ui@1.0.0/node_modules/@acme/ui/src`;
	const [, family, page] = await compileTsrxModulesWithInterfaces([
		{
			filename: `${dependency}/helpers.ts`,
			moduleId: 'node_modules/@acme/ui/src/helpers.ts',
			source: HELPERS,
			importSource: './helpers.ts',
		},
		{
			filename: `${dependency}/box.tsrx`,
			moduleId: 'node_modules/@acme/ui/src/box.tsrx',
			source: FAMILY,
			importSource: '@acme/ui/src/box.tsrx',
		},
		{
			filename: `${MACHINE_ROOT}/src/pages/page.tsrx`,
			moduleId: 'src/pages/page.tsrx',
			source: PAGE,
		},
	]);

	const errors = (compiled: typeof page) =>
		[...compiled.semanticGraph.diagnostics, ...compiled.symbolModules.diagnostics]
			.filter((diagnostic) => diagnostic.severity === 'error')
			.map((diagnostic) => diagnostic.code);
	expect(errors(family!)).toEqual([]);
	expect(errors(page!)).toEqual([]);

	const derive = page!.symbolModules.modules.filter(
		(module) => module.kind === 'sync-computed-derive',
	);
	expect(derive).toHaveLength(1);
	// './helpers.ts' beside the dependency module, spelled from src/pages/.
	expect(derive[0]!.source).toContain(
		'import { shout } from "../../node_modules/@acme/ui/src/helpers.ts";',
	);
	expect(emitted(page!)).not.toContain(MACHINE_ROOT);
	expect(emitted(page!)).toContain('shared:node_modules/@acme/ui/src/box.tsrx#box');
});
