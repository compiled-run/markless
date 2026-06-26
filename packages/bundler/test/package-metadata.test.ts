import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const frameworkPackages = [
	'packages/serializer/package.json',
	'packages/runtime/package.json',
	'packages/compiler/package.json',
	'packages/bundler/package.json',
	'packages/arcade/package.json',
	'packages/typescript-plugin/package.json',
	'packages/vitest-browser/package.json',
] as const;

const retiredPackageManifests = [
	'packages/core/package.json',
	'packages/protocol/package.json',
	'packages/test-utils/package.json',
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

	test('workspace test script includes package-local Witness boxes', async () => {
		const workspace = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
			readonly scripts?: Record<string, string>;
		};
		const bundler = JSON.parse(
			await readFile(resolve(root, 'packages/bundler/package.json'), 'utf8'),
		) as {
			readonly scripts?: Record<string, string>;
		};

		expect(bundler.scripts?.['test:boxes']).toBe('witness run');
		expect(workspace.scripts?.test).toBe(
			'vp test && pnpm bench:jsfb:guard && pnpm --dir packages/bundler test:boxes',
		);
	});

	test('JSFB fixture aliases Arcade subpath imports before the package root', async () => {
		const config = await readFile(
			resolve(root, 'demos/js-framework-benchmark/frameworks/keyed/arcade/vite.config.ts'),
			'utf8',
		);

		const preloadAlias = config.indexOf("find: 'arcade/preload'");
		const eventOnlyResumeAlias = config.indexOf("find: 'arcade/runtime/event-only-resume'");
		const runtimeEventOnlyResumeAlias = config.indexOf(
			"find: '@arcade/runtime/event-only-resume'",
		);
		const runtimeRootAlias = config.indexOf("find: '@arcade/runtime'");
		const rootAlias = config.indexOf("find: 'arcade'");

		expect(preloadAlias).toBeGreaterThanOrEqual(0);
		expect(eventOnlyResumeAlias).toBeGreaterThanOrEqual(0);
		expect(runtimeEventOnlyResumeAlias).toBeGreaterThanOrEqual(0);
		expect(runtimeEventOnlyResumeAlias).toBeLessThan(runtimeRootAlias);
		expect(preloadAlias).toBeLessThan(rootAlias);
		expect(eventOnlyResumeAlias).toBeLessThan(rootAlias);
		expect(config).toContain("packages/arcade/src/preload.ts");
		expect(config).toContain("packages/arcade/src/runtime/event-only-resume.ts");
		expect(config).toContain("packages/runtime/src/event-only-resume.ts");
	});
});
