import { expect, test } from 'vitest';
import type { LinkedClaimManifest, LinkedModuleChildResolution } from '../src/artifacts.ts';
import { linkCompilerPasses } from '../src/pass-registry.ts';
import {
	RENDER_DATA_MODULE_PASS_ID,
	planRenderDataModule,
	renderDataContentHash,
} from '../src/passes/render-data/manifest.ts';
import {
	linkImportedModules,
	linkedRenderDataReachRoot,
	renderDataReachImportSources,
} from '../src/passes/link/module-link.ts';

const CHILD_STYLE_ID = 'virtual:markless:style:%2Fapp%2Fcard.tsrx.css';
const PAGE_STYLE_ID = 'virtual:markless:style:%2Fapp%2Fpage.tsrx.css';

const manifest = (source: string): LinkedClaimManifest => ({
	source,
	resolver: { virtualModuleId: `virtual:markless:resolver:${encodeURIComponent(source)}` },
	symbols: [
		{
			symbolId: 'sym-1',
			exportName: 'marklessSymbol1',
			kind: 'event-handler',
			virtualModuleId: `virtual:markless:symbol:${encodeURIComponent(source)}:sym-1`,
		},
	],
});

const renderDataModule = (input: {
	source: string;
	moduleSource?: string;
	styleModules?: ReadonlyArray<string>;
	linkedModules?: Iterable<string>;
}) =>
	planRenderDataModule({
		source: input.source,
		emittedModule: `${input.source}?markless-render-data`,
		moduleSource: input.moduleSource ?? 'export const marklessPrerenderData = undefined;',
		styleModules: input.styleModules ?? [],
		manifest: manifest(input.source),
		...(input.linkedModules ? { linkedModules: input.linkedModules } : {}),
	});

test('render-data-module is registered as a link pass with its artifact boundary', () => {
	expect(linkCompilerPasses).toContainEqual({
		passId: RENDER_DATA_MODULE_PASS_ID,
		description: expect.stringContaining('render-data module'),
		consumes: ['moduleManifests', 'publicRenderModule'],
		produces: ['renderDataModule'],
	});
});

// Pinned from the pre-move bundler function (`plugin-state.ts renderDataHash`)
// before it was touched. The dev prerender feed compares these strings across
// rebuilds, so a drift here is a silent dev-prerender parity break.
test('contentHash is the exact FNV-1a mrd1 value the dev prerender feed compares', () => {
	expect(renderDataContentHash('export const marklessPrerenderData = undefined;')).toBe(
		'mrd1-in88tb',
	);
	expect(
		renderDataContentHash(
			'export const marklessPrerenderData = {"html":"<div>hi</div>"};\n',
		),
	).toBe('mrd1-1286w5a');
	expect(renderDataContentHash('')).toBe('mrd1-ztntfp');
	expect(
		renderDataModule({
			source: '/app/page.tsrx',
			moduleSource: 'export const marklessPrerenderData = undefined;',
		}).contentHash,
	).toBe('mrd1-in88tb');
});

test('a scoped style survives being consumed by another module link', () => {
	const card = renderDataModule({
		source: '/app/card.tsrx',
		styleModules: [CHILD_STYLE_ID],
		linkedModules: [CHILD_STYLE_ID],
	});
	expect(card.styleModules).toEqual([CHILD_STYLE_ID]);
	expect(card.diagnostics).toEqual([]);

	// The page composes the card, so the page's link carries the card's style
	// module as well as its own: a published component's styleModules are what
	// the consuming app links, not something the child keeps to itself.
	const page = renderDataModule({
		source: '/app/page.tsrx',
		styleModules: [PAGE_STYLE_ID, ...card.styleModules],
		linkedModules: [PAGE_STYLE_ID, CHILD_STYLE_ID, 'virtual:markless:payload:%2Fapp%2Fpage.tsrx'],
	});
	expect(page.styleModules).toContain(CHILD_STYLE_ID);
	expect(page.diagnostics).toEqual([]);
});

test('a style module missing from the link is a diagnostic, not silence', () => {
	const page = renderDataModule({
		source: '/app/page.tsrx',
		styleModules: [PAGE_STYLE_ID, CHILD_STYLE_ID],
		linkedModules: [PAGE_STYLE_ID],
	});
	expect(page.diagnostics).toHaveLength(1);
	expect(page.diagnostics[0]).toMatchObject({
		code: 'MARKLESS_RENDER_DATA_STYLE_UNLINKED',
		severity: 'error',
		passId: RENDER_DATA_MODULE_PASS_ID,
		source: '/app/page.tsrx',
	});
	expect(page.diagnostics[0].message).toContain(CHILD_STYLE_ID);
});

test('an unasked link reports no style diagnostics at all', () => {
	expect(
		renderDataModule({ source: '/app/page.tsrx', styleModules: [PAGE_STYLE_ID] }).diagnostics,
	).toEqual([]);
});

test('the claim manifest of a data-only facade owns no symbols', () => {
	const page = renderDataModule({ source: '/app/page.tsrx', styleModules: [PAGE_STYLE_ID] });
	expect(manifest('/app/page.tsrx').symbols).toHaveLength(1);
	expect(page.claimManifest.symbols).toEqual([]);
	expect(page.claimManifest.source).toBe('/app/page.tsrx?markless-render-data');
	expect(page.claimManifest.resolver).toEqual(manifest('/app/page.tsrx').resolver);
	expect(
		renderDataModule({ source: '/app/card.tsrx', styleModules: [] }).claimManifest.symbols,
	).toEqual([]);
});

const child = (specifier: string, source: string): LinkedModuleChildResolution => ({
	parent: '/app/page.tsrx',
	specifier,
	source,
	externalized: false,
});

const reachedGraph = (
	children: ReadonlyArray<LinkedModuleChildResolution>,
	root: string | undefined,
) =>
	linkImportedModules({
		children,
		moduleArtifacts: new Map(),
		captureMetadataForSource: () => undefined,
		parentCaptureMetadataForSource: () => undefined,
		symbolRouteSource: (source) => `${source}?markless-symbols`,
		...(root
			? {
					renderDataReachRoot: root,
					reachedRenderDataSource: (source: string, reachRoot: string) =>
						`${source}?markless-render-data&markless-reached-from=${reachRoot}`,
				}
			: {}),
	});

test('the reach a render-data link was qualified by is recorded on the module graph', () => {
	const graph = reachedGraph(
		[child('./card.tsrx', '/app/card.tsrx'), child('../card', '/app/card.tsrx')],
		'/app/page.tsrx',
	);
	expect(Object.keys(graph.reachedRenderData)).toHaveLength(1);
	expect(Object.values(graph.reachedRenderData)[0]).toMatchObject({
		root: '/app/page.tsrx',
		source: '/app/card.tsrx',
		specifiers: ['./card.tsrx', '../card'],
	});
	// Every specifier of one `(root, source)` reach reads back to one module source.
	expect(renderDataReachImportSources(graph)).toEqual({
		'./card.tsrx':
			'/app/card.tsrx?markless-render-data&markless-reached-from=/app/page.tsrx',
		'../card': '/app/card.tsrx?markless-render-data&markless-reached-from=/app/page.tsrx',
	});
});

test('an unqualified link records no reach', () => {
	const graph = reachedGraph([child('./card.tsrx', '/app/card.tsrx')], undefined);
	expect(graph.reachedRenderData).toEqual({});
	expect(renderDataReachImportSources(graph)).toEqual({});
});

test('a materialized source is its own reach root, otherwise the transport answers', () => {
	const materialized = new Map([['/app/page.tsrx', {}]]);
	expect(
		linkedRenderDataReachRoot({
			source: '/app/page.tsrx',
			materializedSources: materialized,
			reachedFrom: undefined,
		}),
	).toBe('/app/page.tsrx');
	expect(
		linkedRenderDataReachRoot({
			source: '/app/card.tsrx',
			materializedSources: materialized,
			reachedFrom: '/app/page.tsrx',
		}),
	).toBe('/app/page.tsrx');
	expect(
		linkedRenderDataReachRoot({
			source: '/app/card.tsrx',
			materializedSources: materialized,
			reachedFrom: undefined,
		}),
	).toBeUndefined();
});
