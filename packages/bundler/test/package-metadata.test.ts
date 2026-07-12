import { access, readFile } from 'node:fs/promises';
import { resolve } from 'pathe';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const frameworkPackages = [
	'packages/serializer/package.json',
	'packages/runtime/package.json',
	'packages/web/package.json',
	'packages/compiler/package.json',
	'packages/bundler/package.json',
	'packages/core/package.json',
	'packages/typescript-plugin/package.json',
	'packages/vitest-browser/package.json',
] as const;

const retiredPackageManifests = [
	'packages/protocol/package.json',
	'packages/test-utils/package.json',
	'packages/platform-web/package.json',
	'packages/platform-mobile/package.json',
	'packages/platform-desktop/package.json',
	'packages/adapter-mobile-ios/package.json',
	'packages/adapter-mobile-android/package.json',
	'packages/adapter-desktop-macos/package.json',
] as const;

describe('package metadata', () => {
	test('framework packages are declared side-effect free for tree shaking', async () => {
		for (const packageJsonPath of frameworkPackages) {
			const packageJson = JSON.parse(
				await readFile(resolve(root, packageJsonPath), 'utf8'),
			) as {
				readonly name?: string;
				readonly sideEffects?: unknown;
			};

			expect(packageJson.sideEffects, `${packageJson.name} in ${packageJsonPath}`).toBe(
				false,
			);
		}
	});

	test('retired package shells are not workspace packages', async () => {
		for (const packageJsonPath of retiredPackageManifests) {
			await expect(access(resolve(root, packageJsonPath))).rejects.toThrow();
		}
	});

	test('web platform code has its own package boundary', async () => {
		const runtime = JSON.parse(
			await readFile(resolve(root, 'packages/runtime/package.json'), 'utf8'),
		) as {
			readonly dependencies?: Record<string, string>;
			readonly exports?: Record<string, string>;
		};
		const web = JSON.parse(
			await readFile(resolve(root, 'packages/web/package.json'), 'utf8'),
		) as {
			readonly name?: string;
			readonly dependencies?: Record<string, string>;
			readonly exports?: Record<string, string>;
		};

		expect(web.name).toBe('@markless/web');
		expect(web.dependencies?.['@markless/runtime']).toBe('workspace:*');
		expect(runtime.dependencies).not.toHaveProperty('@markless/web');
		expect(Object.keys(runtime.exports ?? {})).not.toEqual(
			expect.arrayContaining([
				'./dom-journal',
				'./dom-update',
				'./event-only-resume',
				'./event-resume',
				'./render',
				'./render-to-string',
				'./resume',
			]),
		);
		expect(web.exports).toMatchObject({
			'.': './src/index.ts',
			'./dom-journal': './src/dom-journal.ts',
			'./dom-update': './src/dom-update.ts',
			'./event-only-resume': './src/event-only-resume.ts',
			'./event-resume': './src/event-resume.ts',
			'./payload': './src/payload.ts',
			'./render': './src/render.ts',
			'./render-to-string': './src/render-to-string.ts',
			'./resume': './src/payload-full.ts',
		});
	});

	test('runnable demos are root workspace packages', async () => {
		const workspace = await readFile(resolve(root, 'pnpm-workspace.yaml'), 'utf8');

		expect(workspace).toContain('- demos/*');
		await expect(access(resolve(root, 'benchmarks'))).rejects.toThrow();
		await expect(access(resolve(root, 'demos/music-player/package.json'))).resolves.toBe(
			undefined,
		);
		await expect(access(resolve(root, 'demos/music-player-ssr/package.json'))).resolves.toBe(
			undefined,
		);
	});

	test('music player demos do not enable privileged Vite DevTools by default', async () => {
		for (const demo of ['music-player', 'music-player-ssr']) {
			const manifest = JSON.parse(
				await readFile(resolve(root, `demos/${demo}/package.json`), 'utf8'),
			) as { readonly devDependencies?: Record<string, string> };
			const config = await readFile(resolve(root, `demos/${demo}/vite.config.ts`), 'utf8');

			expect(manifest.devDependencies).not.toHaveProperty('@vitejs/devtools');
			expect(config).not.toContain('@vitejs/devtools');
			expect(config).not.toContain('DevTools');
			expect(config).not.toContain('devtools: {}');
		}
	});

	test('music player demo is a plain CSR app without router or SSR hosts', async () => {
		const manifest = JSON.parse(
			await readFile(resolve(root, 'demos/music-player/package.json'), 'utf8'),
		) as {
			readonly scripts?: Record<string, string>;
			readonly dependencies?: Record<string, string>;
		};
		const config = await readFile(resolve(root, 'demos/music-player/vite.config.ts'), 'utf8');

		expect(manifest.dependencies).not.toHaveProperty('@markless/router');
		expect(manifest.scripts).not.toHaveProperty('smoke:ssr');
		expect(config).not.toContain('@markless/router');
		expect(config).toContain('plugins: [markless({ executionLog })]');
		await expect(access(resolve(root, 'demos/music-player/index.html'))).resolves.toBe(
			undefined,
		);
		await expect(access(resolve(root, 'demos/music-player/src/main.ts'))).resolves.toBe(
			undefined,
		);
		await expect(access(resolve(root, 'demos/music-player/document.tsrx'))).rejects.toThrow();
		await expect(
			access(resolve(root, 'demos/music-player/pages/index.tsrx')),
		).rejects.toThrow();
		await expect(
			access(resolve(root, 'demos/music-player/src/dev-server.ts')),
		).rejects.toThrow();
	});

	test('music player SSR demo stays a router app without custom client or SSR hosts', async () => {
		const manifest = JSON.parse(
			await readFile(resolve(root, 'demos/music-player-ssr/package.json'), 'utf8'),
		) as {
			readonly scripts?: Record<string, string>;
			readonly dependencies?: Record<string, string>;
		};
		const config = await readFile(
			resolve(root, 'demos/music-player-ssr/vite.config.ts'),
			'utf8',
		);

		expect(manifest.dependencies).toHaveProperty('@markless/router');
		expect(manifest.scripts).not.toHaveProperty('smoke:ssr');
		expect(config).toContain("import { router } from '@markless/router/vite';");
		expect(config).toContain('plugins: [markless({ executionLog }), router()]');
		expect(config).not.toContain('musicPlayerSsrHost');
		await expect(access(resolve(root, 'demos/music-player-ssr/document.tsrx'))).resolves.toBe(
			undefined,
		);
		await expect(
			access(resolve(root, 'demos/music-player-ssr/pages/index.tsrx')),
		).resolves.toBe(undefined);
		await expect(access(resolve(root, 'demos/music-player-ssr/index.html'))).rejects.toThrow();
		await expect(access(resolve(root, 'demos/music-player-ssr/src/main.ts'))).rejects.toThrow();
		await expect(
			access(resolve(root, 'demos/music-player-ssr/src/dev-server.ts')),
		).rejects.toThrow();
	});

	test('workspace test script includes package-local Witness boxes', async () => {
		const workspace = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
			readonly scripts?: Record<string, string>;
		};
		const bundler = JSON.parse(
			await readFile(resolve(root, 'packages/bundler/package.json'), 'utf8'),
		) as {
			readonly scripts?: Record<string, string>;
		};
		const router = JSON.parse(
			await readFile(resolve(root, 'packages/router/package.json'), 'utf8'),
		) as {
			readonly scripts?: Record<string, string>;
		};

		expect(bundler.scripts?.['test:boxes']).toBe('witness run');
		expect(router.scripts?.['test:boxes']).toBe('witness run');
		expect(workspace.scripts?.test).toBe(
			'vp test && pnpm bench:jsfb:guard && pnpm --dir packages/bundler test:boxes && pnpm --dir packages/router test:boxes && pnpm --dir demos/music-player test:boxes && pnpm --dir demos/music-player-ssr test:boxes',
		);
	});

	test('router package publishes built dist without local fixtures or boxes', async () => {
		const router = JSON.parse(
			await readFile(resolve(root, 'packages/router/package.json'), 'utf8'),
		) as {
			readonly files?: readonly string[];
		};

		// src/vite/entries rides along deliberately: the vite plugin serves those
		// files as app-context virtual entries compiled by the CONSUMER app, so
		// they must ship as source (scripts/release/publish-shape.test.ts owns
		// the entry-shape assertions). Fixtures, boxes, and tests stay out.
		expect(router.files).toEqual(['dist', 'src/vite/entries']);
	});

	test('JSFB fixture aliases Markless subpath imports before the package root', async () => {
		const config = await readFile(
			resolve(root, 'demos/js-framework-benchmark/frameworks/keyed/markless/vite.config.ts'),
			'utf8',
		);

		const preloadAlias = config.indexOf("find: '@markless/core/preload'");
		const eventOnlyResumeAlias = config.indexOf("find: '@markless/core/web/event-only-resume'");
		const runtimeEventOnlyResumeAlias = config.indexOf(
			"find: '@markless/core/runtime/event-only-resume'",
		);
		const webRenderAlias = config.indexOf("find: '@markless/web/render'");
		const runtimeRenderAlias = config.indexOf("find: '@markless/runtime/render'");
		const webEventOnlyResumeAlias = config.indexOf("find: '@markless/web/event-only-resume'");
		const runtimePackageEventOnlyResumeAlias = config.indexOf(
			"find: '@markless/runtime/event-only-resume'",
		);
		const runtimeRootAlias = config.indexOf("find: '@markless/runtime'");
		const rootAlias = config.indexOf("find: '@markless/core'");

		expect(preloadAlias).toBeGreaterThanOrEqual(0);
		expect(eventOnlyResumeAlias).toBeGreaterThanOrEqual(0);
		expect(runtimeEventOnlyResumeAlias).toBeGreaterThanOrEqual(0);
		expect(webRenderAlias).toBeGreaterThanOrEqual(0);
		expect(runtimeRenderAlias).toBeGreaterThanOrEqual(0);
		expect(webEventOnlyResumeAlias).toBeGreaterThanOrEqual(0);
		expect(runtimePackageEventOnlyResumeAlias).toBeGreaterThanOrEqual(0);
		expect(runtimeRenderAlias).toBeLessThan(runtimeRootAlias);
		expect(webEventOnlyResumeAlias).toBeLessThan(runtimeRootAlias);
		expect(runtimePackageEventOnlyResumeAlias).toBeLessThan(runtimeRootAlias);
		expect(preloadAlias).toBeLessThan(rootAlias);
		expect(eventOnlyResumeAlias).toBeLessThan(rootAlias);
		expect(runtimeEventOnlyResumeAlias).toBeLessThan(rootAlias);
		expect(config).toContain('packages/web/src/render.ts');
		expect(config).toContain('packages/runtime/src/render.ts');
		expect(config).toContain('packages/core/src/preload.ts');
		expect(config).toContain('packages/core/src/web/event-only-resume.ts');
		expect(config).toContain('packages/core/src/runtime/event-only-resume.ts');
		expect(config).toContain('packages/web/src/event-only-resume.ts');
		expect(config).toContain('packages/runtime/src/event-only-resume.ts');
	});
});
