import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const frameworkPackages = [
	'packages/core/package.json',
	'packages/protocol/package.json',
	'packages/serializer/package.json',
	'packages/runtime/package.json',
	'packages/compiler/package.json',
	'packages/bundler/package.json',
	'packages/arcade/package.json',
	'packages/test-utils/package.json',
	'packages/vitest-browser/package.json',
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
});
