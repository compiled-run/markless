import { box } from '@arcadejs/witness';

// Product truth: a production Vite build of the CSR fixture must emit the
// bundle graph and lazy symbol chunks through the
// real Vite/Rolldown pipeline. Dev-only HMR wiring must not leak into those
// production artifacts, and the full arcade manifest must not be default output.
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
		name: 'csr build: bundle graph describes tsrx symbols without default manifest',
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
		assertBuildDoesNotInclude(build, MANIFEST);
		await expect.build.artifact(build, BUNDLE_GRAPH);

		await expect.artifact.json(await build.artifact(BUNDLE_GRAPH), (json) => {
			return (
				Array.isArray(json) &&
				json.includes('symbol:0') &&
				json.includes('symbol:1') &&
				json.some((item) => typeof item === 'string' && item.startsWith('chunk-'))
			);
		});
		await expect.artifact.text(build, INDEX, {
			contains: '/build/chunk-',
			notContains: FORBIDDEN_DEV_STRINGS,
		});
		await expect.build.forbids(build, FORBIDDEN_DEV_STRINGS);

		receipt.note(`scanned ${build.artifacts.length} CSR production artifacts`);
		await receipt.capture('csr production build artifacts verified');
	},
);

function assertBuildDoesNotInclude(
	build: { readonly artifacts: readonly { readonly path: string }[] },
	path: string,
): void {
	if (build.artifacts.some((artifact) => artifact.path === path)) {
		throw new Error(`Expected production build not to emit ${path}.`);
	}
}
