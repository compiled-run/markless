import { expect, test, vi } from 'vitest';

const compiler = vi.hoisted(() => ({
	componentEdges: [] as unknown[],
	protocolState: { version: 1, cells: [], computed: [] },
	protocolView: {
		branches: [],
		keyedRepeats: [],
		elementHandles: [],
		asyncBoundaries: [],
	},
}));

const runtimeDemandMap = (replaced: boolean) => ({
	passId: 'runtime-demand-map' as const,
	version: 1 as const,
	recordKinds: [{ kind: 'event', replaced }],
	symbols: [],
	payloadRecords: [],
	actions: [],
	unknownRecordModuleIds: [],
});

vi.mock('@markless/compiler', async (importOriginal) => {
	// The link helpers below used to be local to transform.ts; keep the real ones so
	// tier selection is still judged by the same predicates.
	const actual = await importOriginal<typeof import('@markless/compiler')>();
	return {
		artifactChildCandidates: actual.artifactChildCandidates,
		linkedRenderDataBoundarySymbols: actual.linkedRenderDataBoundarySymbols,
		moduleInterfaceHash: actual.moduleInterfaceHash,
		prerenderInterfacesComplete: actual.prerenderInterfacesComplete,
		collectTsrxModuleDiagnostics: vi.fn(() => []),
		compileTsrxModule: vi.fn(async () => ({
			semanticGraph: { componentEdges: compiler.componentEdges },
			protocolState: compiler.protocolState,
			protocolView: compiler.protocolView,
			// The real compiler always returns payloadArena (non-optional on
			// CompileTsrxModuleResult); transform.ts reads payloadArena.state.storage
			// unguarded. Empty storage keeps this test focused on tier selection.
			payloadArena: { state: { storage: [] } },
			// runtimeDemandMap is likewise a required compiler artifact. This fixture
			// predates that contract; an empty map represents its no-demand module.
			runtimeDemandMap: runtimeDemandMap(false),
			runtimeDemandMaps: {
				'plain-ssr': runtimeDemandMap(true),
				prerender: runtimeDemandMap(false),
			},
			symbolModules: { modules: [] },
			boundSymbolResolver: { rows: [] },
			publicRenderPlan: { styleScopes: [] },
			payloadScripts: { state: compiler.protocolState, view: compiler.protocolView },
			publicRenderModule: {
				renderDataModuleSource: '',
				moduleSource: '',
				rootExportName: null,
				ssrModuleSource: '',
				ssrExportName: null,
				componentDefinitions: [],
			},
		})),
		emitSymbolResolverModule: vi.fn(() => 'export function loadSymbol() {}'),
	};
});

test('transform selects the explicit demand map for each build class', async () => {
	const { transformTsrxModule } = await import('../src/transform.ts');
	const input = {
		filename: '/workspace/app/src/App.tsrx',
		source: 'export function App() @{}',
		environment: 'client' as const,
	};

	const plainSsr = await transformTsrxModule({ ...input, runtimeDemandClass: 'plain-ssr' });
	const prerender = await transformTsrxModule({ ...input, runtimeDemandClass: 'prerender' });

	expect(plainSsr.manifest.runtimeDemandMap?.recordKinds).toEqual([
		{ kind: 'event', replaced: true },
	]);
	expect(prerender.manifest.runtimeDemandMap?.recordKinds).toEqual([
		{ kind: 'event', replaced: false },
	]);
});

test('payload tier selection does not escalate on component edges alone', async () => {
	compiler.componentEdges = [{ childComponentName: 'Child', importSource: './Child.tsrx' }];
	compiler.protocolView = {
		branches: [],
		keyedRepeats: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const { transformTsrxModule } = await import('../src/transform.ts');

	const result = await transformTsrxModule({
		filename: '/workspace/app/src/App.tsrx',
		source: 'export function App() @{}',
		environment: 'client',
	});

	const resumeModule = result.virtualModules.find((module) => module.type === 'resume');
	expect(result.code).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(resumeModule?.source).not.toContain('resumeEventOnlyFromPayloadDocument');
	expect(resumeModule?.source).toContain("import('@markless/core/web/resume-storage-free')");
	expect(result.code).not.toContain('loadFullResume: marklessFullResumeHandoff');
	expect(result.code).not.toContain("import('@markless/core/web/resume')");
	expect(result.code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);
});
