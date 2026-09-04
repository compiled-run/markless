import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { installedPrefixes, resolveCollectionFile } from '../src/collection-loader.ts';
import { icons } from '../src/vite.ts';

describe('installed collections', () => {
	test('a per-pack package wins over the whole-set bundle', () => {
		const resolve = (specifier: string) => {
			if (specifier === '@iconify-json/lucide/icons.json') return '/per-pack/icons.json';
			if (specifier === '@iconify/json/json/lucide.json') return '/bundle/lucide.json';
			throw new Error(`cannot find ${specifier}`);
		};

		expect(resolveCollectionFile('lucide', resolve)).toBe('/per-pack/icons.json');
	});

	test('the whole-set bundle serves a pack with no per-pack package', () => {
		const resolve = (specifier: string) => {
			if (specifier === '@iconify/json/json/lucide.json') return '/bundle/lucide.json';
			throw new Error(`cannot find ${specifier}`);
		};

		expect(resolveCollectionFile('lucide', resolve)).toBe('/bundle/lucide.json');
	});

	test('a collection installed by neither package names both options', () => {
		const resolve = (specifier: string) => {
			throw new Error(`cannot find ${specifier}`);
		};

		expect(() => resolveCollectionFile('lucide', resolve)).toThrow(
			/@iconify-json\/lucide[\s\S]*@iconify\/json/,
		);
	});

	test('discovery finds per-pack packages beside the whole-set bundle', () => {
		const root = mkdtempSync(join(tmpdir(), 'markless-icons-'));
		mkdirSync(join(root, 'node_modules', '@iconify-json', 'made-up-pack'), { recursive: true });
		writeFileSync(
			join(root, 'node_modules', '@iconify-json', 'made-up-pack', 'icons.json'),
			'{}',
		);

		const prefixes = installedPrefixes([root]);

		expect(prefixes).toContain('made-up-pack');
		expect(prefixes).toContain('lucide');
	});

	test('two prefixes that sanitize to one pack name are refused with both prefixes', () => {
		expect(() => icons({ availableCollections: ['test-pack', 'testpack'] })).toThrow(
			/pack name testpack is ambiguous between test-pack and testpack/,
		);
	});

	test('the default loader reads a real installed collection with no injected data', async () => {
		const plugin = icons();
		const transform = plugin.transform as {
			handler(code: string, id: string): Promise<{ code: string } | undefined>;
		};
		const handler = transform.handler.bind({ warn: vi.fn(), info: vi.fn() });

		const result = await handler(
			"import { lucide } from '@markless/icons'; export function A() @{ <lucide.check/> }",
			'/src/App.tsrx',
		);

		expect(result?.code).toContain('<svg');
		expect(result?.code).toContain('viewBox="0 0 24 24"');
		expect(result?.code).toMatch(/<path\b/);
		expect(result?.code).not.toContain('lucide.check');
	});
});
