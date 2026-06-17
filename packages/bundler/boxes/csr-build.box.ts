import { box } from '@arcadejs/witness';

// Product truth: a production Vite build of the CSR fixture must emit the
// arcade manifest, bundle graph, and lazy symbol chunks through the
// real Vite/Rolldown pipeline. Dev-only HMR wiring must not leak into those
// production artifacts.
const FIXTURE = 'fixtures/vite-csr';
const MANIFEST = `${FIXTURE}/dist/arcade-manifest.json`;
const BUNDLE_GRAPH = `${FIXTURE}/dist/build/bundle-graph.json`;
const INDEX = `${FIXTURE}/dist/index.html`;
const FORBIDDEN_DEV_STRINGS = [
	'virtual:arcade-dev-client',
	'arcade:update',
	'import.meta.hot',
	'location.reload',
];

export default box(
	{
		name: 'csr build: manifest and bundle graph describe tsrx symbols',
		tags: ['csr', 'build'],
		modes: ['build'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.artifact(build, INDEX);
		await expect.build.artifact(build, MANIFEST);
		await expect.build.artifact(build, BUNDLE_GRAPH);

		const manifest = await build.artifact(MANIFEST);
		await expect.artifact.json(manifest, (json) => {
			const value = json as {
				version?: unknown;
				modules?: Array<{
					source?: unknown;
					payload?: { virtualModuleId?: unknown };
					resolver?: { virtualModuleId?: unknown };
					moduleManifest?: { virtualModuleId?: unknown };
					symbols?: Array<{ kind?: unknown; fileName?: unknown }>;
				}>;
				bundleGraphAsset?: unknown;
				bundles?: Record<string, unknown>;
			};
			const module = value.modules?.find(
				(item) => typeof item.source === 'string' && item.source.endsWith('/src/root.tsrx'),
			);
			return (
				value.version === 1 &&
				value.bundleGraphAsset === 'build/bundle-graph.json' &&
				!!module?.payload?.virtualModuleId &&
				!!module.resolver?.virtualModuleId &&
				!!module.moduleManifest?.virtualModuleId &&
				!!module.symbols?.some(
					(symbol) =>
						symbol.kind === 'event-handler' && typeof symbol.fileName === 'string',
				) &&
				!!module.symbols?.some(
					(symbol) => symbol.kind === 'dom-update' && typeof symbol.fileName === 'string',
				) &&
				!!value.bundles &&
				Object.keys(value.bundles).some((name) => name.startsWith('async-'))
			);
		});

		await expect.artifact.json(await build.artifact(BUNDLE_GRAPH), (json) => {
			return Array.isArray(json) && json.includes('symbol:0') && json.includes('symbol:1');
		});
		await expect.artifact.text(build, INDEX, {
			contains: '/build/async-',
			notContains: FORBIDDEN_DEV_STRINGS,
		});
		await expect.build.forbids(build, FORBIDDEN_DEV_STRINGS);

		receipt.note(`scanned ${build.artifacts.length} CSR production artifacts`);
		await receipt.capture('csr production build artifacts verified');
	},
);
