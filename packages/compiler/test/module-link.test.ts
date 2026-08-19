import { expect, test } from 'vitest';
import type {
	CaptureAnalysisArtifact,
	LinkedModuleChildResolution,
	ModuleLinkArtifact,
} from '../src/artifacts.ts';
import { linkCompilerPasses } from '../src/pass-registry.ts';
import {
	linkImportedModules,
	linkedImportedClaimsMissing,
	linkedImportedSymbolInputs,
	linkedModuleChildDiagnostics,
	linkedModuleClaimPlan,
	linkedModuleImportRequests,
	linkedModuleLoadSource,
	linkedSymbolRouteRequests,
	moduleLinkResolutionKey,
	planLinkedModuleChildren,
} from '../src/passes/link/module-link.ts';

const captureMetadata = (passId = 'capture-analysis'): CaptureAnalysisArtifact =>
	({ passId, extractedSymbols: [], diagnostics: [] }) as unknown as CaptureAnalysisArtifact;

const symbolRouteSource = (source: string) => `${source}?markless-symbols`;

const readers = (metadata: Readonly<Record<string, CaptureAnalysisArtifact>>) => ({
	captureMetadataForSource: (source: string) => metadata[source],
	parentCaptureMetadataForSource: (parent: string) => metadata[parent],
});

const graph = (
	children: ReadonlyArray<LinkedModuleChildResolution>,
	metadata: Readonly<Record<string, CaptureAnalysisArtifact>>,
	moduleArtifacts: ReadonlyMap<string, ModuleLinkArtifact> = new Map(),
) =>
	linkImportedModules({
		children,
		moduleArtifacts,
		symbolRouteSource,
		...readers(metadata),
	});

test('module-link is registered as a link pass with its artifact boundary', () => {
	expect(linkCompilerPasses).toContainEqual({
		passId: 'module-link',
		description: expect.stringContaining('typed module graph'),
		consumes: ['moduleArtifacts', 'resolution'],
		produces: ['linkedModuleGraph'],
	});
});

test('the resolution table decides the source, never the request', () => {
	const requests = linkedSymbolRouteRequests('/app/pages/home.tsrx', [
		{ prefix: 'a', importSource: './widget.tsrx', componentEdgeId: 'component-edge:0' },
	]);
	const children = planLinkedModuleChildren(requests, {
		[moduleLinkResolutionKey('./widget.tsrx', '/app/pages/home.tsrx')]: {
			id: '/app/pages/widget.tsrx',
			external: false,
			kind: 'resolved',
		},
	});
	expect(children).toEqual([
		{
			parent: '/app/pages/home.tsrx',
			specifier: './widget.tsrx',
			source: '/app/pages/widget.tsrx',
			componentEdgeId: 'component-edge:0',
			externalized: false,
		},
	]);
});

test('only TSRX module imports become interface link requests', () => {
	expect(
		linkedModuleImportRequests('/app/pages/home.tsrx', [
			{ source: './widget.tsrx' },
			{ source: '@markless/core' },
			{ source: './helpers.ts' },
		]),
	).toEqual([{ parent: '/app/pages/home.tsrx', specifier: './widget.tsrx' }]);
});

test('an externalized child is an external delegate and is never a load request', () => {
	const children = planLinkedModuleChildren(
		[{ parent: '/app/pages/home.tsrx', specifier: '@markless/router' }],
		{
			[moduleLinkResolutionKey('@markless/router', '/app/pages/home.tsrx')]: {
				id: '@markless/router',
				external: true,
				kind: 'resolved',
			},
		},
	);
	const artifact = graph(children, { '/app/pages/home.tsrx': captureMetadata() });

	expect(artifact.passId).toBe('module-link');
	expect(artifact.children).toEqual([
		expect.objectContaining({ kind: 'external-delegate', externalized: true }),
	]);
	// The whole point of the kind: the driver has nothing to load, so a bare
	// external id can never reach the bundler's `load`.
	expect(linkedModuleLoadSource(artifact.children[0]!, false)).toBeUndefined();
	expect(artifact.diagnostics).toEqual([]);
});

test('a .ts child that is a compiled TSRX module links as compiled-tsrx', () => {
	// The filename says plain TypeScript; the artifact says otherwise, and the
	// artifact decides.
	const children = planLinkedModuleChildren(
		[{ parent: '/app/pages/home.tsrx', specifier: 'package/widget' }],
		{
			[moduleLinkResolutionKey('package/widget', '/app/pages/home.tsrx')]: {
				id: '/app/node_modules/package/dist/widget.ts',
				external: false,
				kind: 'resolved',
			},
		},
	);
	const artifact = graph(children, {
		'/app/pages/home.tsrx': captureMetadata(),
		'/app/node_modules/package/dist/widget.ts': captureMetadata(),
	});

	expect(artifact.children[0]?.kind).toBe('compiled-tsrx');
	expect(artifact.diagnostics).toEqual([]);
});

test('a .ts child with no compiled artifact stays a plain TypeScript helper', () => {
	const children = planLinkedModuleChildren(
		[{ parent: '/app/pages/home.tsrx', specifier: '@markless/router' }],
		{
			[moduleLinkResolutionKey('@markless/router', '/app/pages/home.tsrx')]: {
				id: '/app/packages/router/src/html.ts',
				external: false,
				kind: 'resolved',
			},
		},
	);
	const artifact = graph(children, { '/app/pages/home.tsrx': captureMetadata() });

	expect(artifact.children[0]?.kind).toBe('plain-ts');
	expect(artifact.diagnostics).toEqual([]);
});

test('a child with missing capture metadata yields a diagnostic, not a bare throw', () => {
	const children = planLinkedModuleChildren(
		[{ parent: '/workspace/app/pages/App.tsrx', specifier: 'stale-child' }],
		{
			[moduleLinkResolutionKey('stale-child', '/workspace/app/pages/App.tsrx')]: {
				id: '/workspace/node_modules/stale-child/dist/index.js',
				external: false,
				kind: 'resolved',
			},
		},
	);
	const artifact = graph(children, { '/workspace/app/pages/App.tsrx': captureMetadata() });

	expect(artifact.children[0]?.kind).toBe('unresolved');
	expect(artifact.diagnostics).toHaveLength(1);
	expect(artifact.diagnostics[0]).toMatchObject({
		code: 'MARKLESS_CAPTURE_METADATA_MISSING',
		severity: 'error',
		passId: 'module-link',
	});
	expect(artifact.diagnostics[0]?.message).toContain(
		'MARKLESS_CAPTURE_METADATA_MISSING: Parent module "/workspace/app/pages/App.tsrx" composes imported child "stale-child", but its compiled artifact has no current capture metadata.',
	);
});

test('a child compiled by another compiler revision is not current metadata', () => {
	const children: LinkedModuleChildResolution[] = [
		{
			parent: '/app/pages/home.tsrx',
			specifier: './widget.tsrx',
			source: '/app/pages/widget.tsrx',
			externalized: false,
		},
	];
	const stale = linkedModuleChildDiagnostics(
		children,
		readers({
			'/app/pages/home.tsrx': captureMetadata(),
			'/app/pages/widget.tsrx': captureMetadata('capture-analysis@older'),
		}),
	);
	expect(stale).toHaveLength(1);
});

test('the linked interface map keys the imported interfaces by specifier', () => {
	const widget = {
		passId: 'module-graph-interface',
		filename: '/app/pages/widget.tsrx',
		exports: [],
		render: { version: 1, components: [] },
	} as unknown as ModuleLinkArtifact['moduleGraphInterface'];
	const children: LinkedModuleChildResolution[] = [
		{
			parent: '/app/pages/home.tsrx',
			specifier: './widget.tsrx',
			source: '/app/pages/widget.tsrx',
			externalized: false,
		},
	];
	const artifact = graph(
		children,
		{
			'/app/pages/home.tsrx': captureMetadata(),
			'/app/pages/widget.tsrx': captureMetadata(),
		},
		new Map([
			[
				'/app/pages/widget.tsrx',
				{
					moduleGraphInterface: widget,
					interfaceHash: 'mgi1-test',
					moduleImports: [],
				} as unknown as ModuleLinkArtifact,
			],
		]),
	);

	expect(artifact.interfaces).toEqual({ './widget.tsrx': widget });
	expect(artifact.routeArtifacts).toEqual({
		'/app/pages/widget.tsrx': '/app/pages/widget.tsrx?markless-symbols',
	});
});

test('the claim plan names the symbol route only for a client child with symbols', () => {
	const child: LinkedModuleChildResolution = {
		parent: '/app/pages/home.tsrx',
		specifier: './widget.tsrx',
		source: '/app/pages/widget.tsrx',
		externalized: false,
	};
	const plan = (
		clientEnvironment: boolean,
		metadata: CaptureAnalysisArtifact | undefined,
		completeWakeVariants = false,
	) =>
		linkedModuleClaimPlan({
			child,
			captureMetadata: metadata,
			clientEnvironment,
			completeWakeVariants,
			symbolRouteSource,
			resumeSource: (source) => `${source}?markless-resume`,
			wakeSource: (source) => `${source}?markless-prerender-wake`,
		});

	expect(plan(false, undefined)).toEqual({ claimSources: [], expectClaims: false, seal: false });
	expect(plan(true, captureMetadata())).toEqual({
		claimSources: [],
		expectClaims: false,
		seal: true,
	});
	const withSymbols = {
		passId: 'capture-analysis',
		extractedSymbols: [{ symbolId: 's0' }],
		diagnostics: [],
	} as unknown as CaptureAnalysisArtifact;
	expect(plan(true, withSymbols).claimSources).toEqual([
		'/app/pages/widget.tsrx?markless-symbols',
	]);
	expect(plan(true, withSymbols, true).claimSources).toEqual([
		'/app/pages/widget.tsrx',
		'/app/pages/widget.tsrx?markless-resume',
		'/app/pages/widget.tsrx?markless-prerender-wake',
		'/app/pages/widget.tsrx?markless-symbols',
	]);
});

test('a child with no component edge never blocks the imported-claims seal', () => {
	const propBound = {
		passId: 'capture-analysis',
		extractedSymbols: [{ symbolId: 's0', captureSlots: [{ propName: 'onSelect' }] }],
		diagnostics: [],
	} as unknown as CaptureAnalysisArtifact;
	const claims = {
		symbols: [
			{
				symbolId: 's0',
				exportName: 's0_export',
				kind: 'event-handler',
				virtualModuleId: 'virtual:markless:symbol:s0',
			},
		],
	};
	const child = (componentEdgeId?: string): LinkedModuleChildResolution => ({
		parent: '/app/pages/index.tsrx',
		specifier: './widget.tsrx',
		source: '/app/pages/widget.tsrx',
		externalized: false,
		...(componentEdgeId === undefined ? {} : { componentEdgeId }),
	});
	const symbolInputs = (children: ReadonlyArray<LinkedModuleChildResolution>) =>
		linkedImportedSymbolInputs({
			children,
			captureMetadataForSource: () => propBound,
			symbolClaimsForSource: () => claims,
		});
	const missing = (
		children: ReadonlyArray<LinkedModuleChildResolution>,
		symbols: ReturnType<typeof symbolInputs>,
	) =>
		linkedImportedClaimsMissing({
			children,
			symbols,
			captureMetadataForSource: () => propBound,
		});

	// The premise: an edgeless child is never a row, so waiting on its row waits forever.
	expect(symbolInputs([child()])).toEqual([]);
	expect(missing([child()], symbolInputs([child()]))).toBe(false);

	// A child that does carry an edge still waits until its row arrives.
	expect(symbolInputs([child('edge-1')])).toHaveLength(1);
	expect(missing([child('edge-1')], [])).toBe(true);
	expect(missing([child('edge-1')], symbolInputs([child('edge-1')]))).toBe(false);
});
