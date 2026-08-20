import { expect, test } from 'vitest';
import type {
	CaptureAnalysisArtifact,
	LinkedModuleChildResolution,
	ModuleGraphInterfaceArtifact,
	ModuleLinkArtifact,
} from '../src/artifacts.ts';
import { linkCompilerPasses } from '../src/pass-registry.ts';
import {
	linkBarrelComponents,
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


// The barrel walk is a pass step: it resolves nothing and reads no file. Every
// specifier it reaches comes back as a pending request the driver fills, so the
// walk below runs the same fixpoint the driver runs.
const barrelInterface = (
	filename: string,
	reexports: ReadonlyArray<{ exportName: string; source: string; importedName: string }>,
): ModuleGraphInterfaceArtifact => ({
	passId: 'module-graph-interface',
	filename,
	exports: [],
	reexports,
	render: { version: 1, components: [] },
});

const componentInterface = (
	filename: string,
	componentName: string,
	exportName: string,
): ModuleGraphInterfaceArtifact => ({
	passId: 'module-graph-interface',
	filename,
	exports: [],
	render: {
		version: 1,
		components: [{ componentName, exportName, rootChunkId: 'chunk:0', childChunks: [] }],
	},
});

// Stands in for the bundler's resolver: joins the specifier onto the importer's
// directory, and answers nothing for a file the fixture does not declare.
const declaredFiles = new Set<string>();
const joinResolve = (specifier: string, importer: string): string | null => {
	const base = importer.slice(0, importer.lastIndexOf('/'));
	const joined = `${base}/${specifier.replace(/^\.\//, '')}`;
	return declaredFiles.has(joined) ? joined : null;
};

function walkBarrels(input: {
	readonly parent: string;
	readonly moduleImports: ReadonlyArray<{ readonly source: string }>;
	readonly resolve: (specifier: string, importer: string) => string | null;
	readonly interfaces: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}) {
	declaredFiles.clear();
	for (const filename of Object.keys(input.interfaces)) declaredFiles.add(filename);
	const resolution: Record<string, string | null> = {};
	const read = new Map<string, ModuleGraphInterfaceArtifact | null>();
	const call = () =>
		linkBarrelComponents({
			parent: input.parent,
			moduleImports: input.moduleImports,
			resolution,
			moduleInterface: (filename) => read.get(filename),
			rebase: (target) => `./${target.slice('/app/'.length)}`,
		});
	let artifact = call();
	for (let round = 0; artifact.pendingResolutions.length + artifact.pendingInterfaces.length; ) {
		expect(round).toBeLessThan(8);
		round += 1;
		for (const request of artifact.pendingResolutions) {
			resolution[moduleLinkResolutionKey(request.specifier, request.parent)] = input.resolve(
				request.specifier,
				request.parent,
			);
		}
		for (const filename of artifact.pendingInterfaces) {
			read.set(filename, input.interfaces[filename] ?? null);
		}
		artifact = call();
	}
	return artifact;
}

test('linkBarrelComponents follows an export * as chain to the .tsrx components behind it', () => {
	const artifact = walkBarrels({
		parent: '/app/App.tsrx',
		moduleImports: [{ source: './ui.ts' }, { source: 'rolldown' }, { source: './Other.tsrx' }],
		resolve: joinResolve,
		interfaces: {
			'/app/ui.ts': barrelInterface('/app/ui.ts', [
				{ exportName: 'checkbox', source: './checkbox/index.ts', importedName: '*' },
			]),
			'/app/checkbox/index.ts': barrelInterface('/app/checkbox/index.ts', [
				{ exportName: 'root', source: './checkbox-root.tsrx', importedName: 'CheckboxRoot' },
				{
					exportName: 'trigger',
					source: './checkbox-trigger.tsrx',
					importedName: 'CheckboxTrigger',
				},
			]),
			'/app/checkbox/checkbox-root.tsrx': componentInterface(
				'/app/checkbox/checkbox-root.tsrx',
				'CheckboxRoot',
				'CheckboxRoot',
			),
			'/app/checkbox/checkbox-trigger.tsrx': componentInterface(
				'/app/checkbox/checkbox-trigger.tsrx',
				'CheckboxTrigger',
				'CheckboxTrigger',
			),
		},
	});

	expect(artifact.diagnostics).toEqual([]);
	expect(artifact.children).toEqual([
		{
			parent: '/app/App.tsrx',
			specifier: './checkbox/checkbox-root.tsrx',
			source: '/app/checkbox/checkbox-root.tsrx',
			externalized: false,
		},
		{
			parent: '/app/App.tsrx',
			specifier: './checkbox/checkbox-trigger.tsrx',
			source: '/app/checkbox/checkbox-trigger.tsrx',
			externalized: false,
		},
	]);
	// The rebased `.tsrx` specifiers carry the real interfaces; the barrel
	// specifier carries only the synthetic `linkedComponents` entry.
	expect(Object.keys(artifact.interfaces).sort()).toEqual([
		'./checkbox/checkbox-root.tsrx',
		'./checkbox/checkbox-trigger.tsrx',
		'./ui.ts',
	]);
	expect(artifact.interfaces['./ui.ts']?.linkedComponents).toEqual([
		{
			exportPath: ['checkbox', 'root'],
			source: './checkbox/checkbox-root.tsrx',
			importKind: 'named',
			importedName: 'CheckboxRoot',
			componentName: 'CheckboxRoot',
		},
		{
			exportPath: ['checkbox', 'trigger'],
			source: './checkbox/checkbox-trigger.tsrx',
			importKind: 'named',
			importedName: 'CheckboxTrigger',
			componentName: 'CheckboxTrigger',
		},
	]);
});

test('linkBarrelComponents reports a re-export that resolves to no module', () => {
	const artifact = walkBarrels({
		parent: '/app/App.tsrx',
		moduleImports: [{ source: './broken.ts' }],
		resolve: joinResolve,
		interfaces: {
			'/app/broken.ts': barrelInterface('/app/broken.ts', [
				{ exportName: 'part', source: './missing-part.tsrx', importedName: 'Part' },
			]),
		},
	});

	expect(artifact.children).toEqual([]);
	expect(artifact.diagnostics).toHaveLength(1);
	expect(artifact.diagnostics[0]?.code).toBe('MARKLESS_COMPONENT_BARREL_UNRESOLVED');
	expect(artifact.diagnostics[0]?.passId).toBe('module-link');
	expect(artifact.diagnostics[0]?.message).toMatch(/missing-part\.tsrx/);
});
