import { expect, test, vi } from 'vitest';

const compiler = vi.hoisted(() => ({
	componentEdges: [] as unknown[],
	protocolView: {
		branches: [],
		keyedRepeats: [],
		elementHandles: [],
		asyncBoundaries: [],
	},
}));

vi.mock('@markless/compiler', () => ({
	compileTsrxModule: vi.fn(async () => ({
		semanticGraph: { componentEdges: compiler.componentEdges },
		protocolView: compiler.protocolView,
		symbolModules: { modules: [] },
		publicRenderPlan: { styleScopes: [] },
		payloadScripts: { state: {}, view: {} },
		publicRenderModule: {
			moduleSource: '',
			rootExportName: null,
			csrModuleSource: '',
			csrExportName: null,
			ssrModuleSource: '',
			ssrExportName: null,
		},
	})),
	emitSymbolResolverModule: vi.fn(() => 'export function loadSymbol() {}'),
}));

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

	expect(result.code).toContain('resumeEventOnlyFromPayloadDocument');
	expect(result.code).toContain('loadFullResume: marklessFullResumeHandoff');
	expect(result.code).not.toContain(
		"import { resumeFromPayloadDocument } from '@markless/core/web/resume';",
	);
});
