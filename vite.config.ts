import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { defineConfig } from 'vite-plus';
import type { PackUserConfig } from 'vite-plus/pack';

// Per-package pack configs (QDS buildOrder shape): each package builds from
// its own directory into its own ./dist so publishConfig.exports can target
// dist files that live inside the published package.

type PackageManifest = {
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

const rootDir = import.meta.dirname;
const packageDir = (packageName: string) => pathResolve(rootDir, 'packages', packageName);

const readPackageManifest = (packageName: string): PackageManifest =>
	JSON.parse(
		readFileSync(pathResolve(packageDir(packageName), 'package.json'), 'utf-8'),
	) as PackageManifest;

const nodeBuiltinImportPattern = /^node:.*$/;

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Matches the package itself and any subpath import of it (e.g. `vite` and
// `vite/module-runner`), so dependencies stay external instead of being
// bundled as private copies.
const packageImportPattern = (packageName: string) =>
	new RegExp(`^${escapeForRegExp(packageName)}(/.*)?$`);

const dependencyImportPatterns = (dependencies: Record<string, string> = {}) =>
	Object.keys(dependencies).map(packageImportPattern);

// QDS externalPackageImports: read the package's own manifest so every
// declared dependency (including @markless/* workspace deps) is externalized.
const externalPackageImports = (packageName: string, options?: { devDependencies?: boolean }) => {
	const manifest = readPackageManifest(packageName);
	return [
		nodeBuiltinImportPattern,
		...dependencyImportPatterns(manifest.dependencies),
		...dependencyImportPatterns(manifest.peerDependencies),
		...(options?.devDependencies ? dependencyImportPatterns(manifest.devDependencies) : []),
	];
};

const buildToolImportPatterns = ['rolldown', 'vite', 'vitest'].map(packageImportPattern);

const marklessPack = (options: {
	packageName: string;
	entry: Record<string, string>;
	platform?: 'neutral' | 'node';
	devDependencies?: boolean;
}): PackUserConfig => ({
	name: `@markless/${options.packageName}`,
	cwd: packageDir(options.packageName),
	entry: options.entry,
	format: ['esm'],
	outDir: './dist',
	platform: options.platform ?? 'neutral',
	// ESM-only output: keep plain .js/.d.ts extensions even for the node
	// platform (cli) so publishConfig.exports stays uniform across packages.
	fixedExtension: false,
	dts: true,
	clean: true,
	deps: {
		neverBundle: [
			...buildToolImportPatterns,
			...externalPackageImports(options.packageName, {
				devDependencies: options.devDependencies,
			}),
		],
		onlyBundle: false,
	},
});

// `./fns/*` is a glob export; enumerate the real modules so every published
// subpath has its own dist entry.
const webFnsEntries = Object.fromEntries(
	readdirSync(pathResolve(packageDir('web'), 'src/fns'))
		.filter((file) => file.endsWith('.ts'))
		.map((file) => [`fns/${file.slice(0, -'.ts'.length)}`, `./src/fns/${file}`]),
);

const buildOrder: PackUserConfig[] = [
	marklessPack({
		packageName: 'analyzer',
		entry: {
			index: './src/index.ts',
			playwright: './src/playwright.ts',
		},
	}),
	marklessPack({
		packageName: 'serializer',
		entry: {
			index: './src/index.ts',
			decode: './src/value-decode.ts',
			'decode-client': './src/value-decode-client.ts',
			protocol: './src/protocol.ts',
			'protocol-validation': './src/protocol-validation-storage.ts',
		},
	}),
	marklessPack({
		packageName: 'compiler',
		entry: {
			index: './src/index.ts',
			'type-service': './src/type-service.ts',
		},
	}),
	marklessPack({
		packageName: 'runtime',
		entry: {
			index: './src/index.ts',
			graph: './src/graph.ts',
			'graph-reconcile': './src/graph-reconcile.ts',
		},
	}),
	marklessPack({
		packageName: 'web',
		entry: {
			index: './src/index.ts',
			'dom-journal': './src/dom-journal.ts',
			'dom-update': './src/dom-update.ts',
			'event-only-resume': './src/event-only-resume.ts',
			'event-only-lean/row': './src/event-only-lean/row.ts',
			'event-only-lean/scalar-core': './src/event-only-lean/scalar-core.ts',
			'event-only-lean/scalar-resume': './src/event-only-lean/scalar-resume.ts',
			'event-resume': './src/event-resume.ts',
			'inline/resumer': './src/inline/resumer.ts',
			payload: './src/payload.ts',
			render: './src/render.ts',
			'render-to-stream': './src/render-to-stream.ts',
			'render-to-string': './src/render-to-string.ts',
			resume: './src/payload-full.ts',
			...webFnsEntries,
			'resume-storage-free': './src/payload-full-storage-free.ts',
		},
	}),
	marklessPack({
		packageName: 'bundler',
		entry: {
			'dev-error': './src/dev-error/index.ts',
			preload: './src/preload.ts',
			rolldown: './src/rolldown.ts',
			vite: './src/vite/index.ts',
		},
	}),
	marklessPack({
		packageName: 'router',
		entry: {
			index: './src/index.ts',
			vite: './src/vite/index.ts',
			'vite/runtime/create-route-discovery': './src/vite/runtime/create-route-discovery.ts',
			'vite/runtime/mdx-route': './src/vite/runtime/mdx-route.ts',
			'vite/runtime/create-server-entry': './src/vite/runtime/create-server-entry.ts',
			'vite/route-href': './src/vite/entries/route-href.ts',
			'typescript-plugin': './src/typescript-plugin/index.ts',
		},
	}),
	marklessPack({
		packageName: 'core',
		entry: {
			index: './src/index.ts',
			preload: './src/preload.ts',
			rolldown: './src/rolldown.ts',
			runtime: './src/runtime.ts',
			'runtime/dom-journal': './src/runtime/dom-journal.ts',
			'runtime/dom-update': './src/runtime/dom-update.ts',
			'runtime/event-only-resume': './src/runtime/event-only-resume.ts',
			'runtime/event-resume': './src/runtime/event-resume.ts',
			'runtime/render': './src/runtime/render.ts',
			'runtime/render-to-string': './src/runtime/render-to-string.ts',
			'runtime/resume': './src/runtime/resume.ts',
			router: './src/router.ts',
			'router/vite': './src/router/vite.ts',
			web: './src/web.ts',
			'web/dom-journal': './src/web/dom-journal.ts',
			'web/dom-update': './src/web/dom-update.ts',
			'web/event-only-resume': './src/web/event-only-resume.ts',
			'web/event-resume': './src/web/event-resume.ts',
			'web/render': './src/web/render.ts',
			'web/render-to-string': './src/web/render-to-string.ts',
			'web/resume': './src/web/resume.ts',
			vite: './src/vite.ts',
			'web/resume-storage-free': './src/web/resume-storage-free.ts',
		},
	}),
	marklessPack({
		packageName: 'cli',
		platform: 'node',
		entry: {
			index: './src/index.ts',
			node: './src/node.ts',
		},
	}),
	marklessPack({
		packageName: 'vitest-browser',
		devDependencies: true,
		entry: {
			index: './src/index.ts',
			// Published as ./ssr-plugin. Its vite and vitest/node imports are
			// `import type` only, so the emitted JS pulls in no build tooling.
			'ssr-plugin': './src/ssr-plugin.ts',
			vitest: './src/vitest.ts',
		},
	}),
];

export default defineConfig({
	staged: {
		'*': 'vp check --fix',
	},
	pack: buildOrder,
	test: {
		// Keep CPU available for the concurrent Chromium + Vite transform pipeline.
		maxWorkers: '50%',
		projects: [
			{
				test: {
					name: 'node',
					environment: 'node',
					include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.ts'],
					exclude: ['packages/typescript-plugin/test/completion-matrix.test.ts'],
					// One id per run: the typescript-plugin test files build the same
					// dist/ from separate workers and lock on it to build it once.
					env: { MARKLESS_TSPLUGIN_CJS_BUILD_RUN: randomUUID() },
				},
			},
			'packages/vitest-browser/vitest.config.ts',
		],
	},
	lint: {
		// No lint.options.typeCheck: tsgolint disagrees with the tsc gate of
		// record (1253 vs 0) because it applies strict-family defaults and lints
		// outside this tsconfig's include/exclude. Raw tsc is the type gate.
		ignorePatterns: ['dist/**', 'node_modules/**', '.claude/**'],
	},
	fmt: {
		useTabs: true,
		tabWidth: 4,
		printWidth: 100,
		endOfLine: 'lf',
		singleQuote: true,
		ignorePatterns: ['dist/**', 'node_modules/**', '.claude/**'],
	},
});
