import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { markless } from '../src/vite/index.ts';
import { callConfig, getPlugin } from './helpers.ts';

describe('browser debug channel compile gate', () => {
	test('keeps SSR rendering inside the define-transformed server entry', async () => {
		const fixture = resolve(import.meta.dirname, '../fixtures/vite-ssr');
		const [host, entry, config] = await Promise.all([
			readFile(resolve(fixture, 'src/dev-server.ts'), 'utf8'),
			readFile(resolve(fixture, 'src/server.ts'), 'utf8'),
			readFile(resolve(fixture, 'vite.config.ts'), 'utf8'),
		]);

		expect(host).toContain('renderToString(entry.default');
		expect(host).toContain('entry.render!');
		expect(entry).toContain('renderToString(App');
		expect(config).toContain("devRenderEntry: '/src/server.ts'");
		expect(config).toContain("builtRenderEntry: 'server-render/server.js'");
		expect(config).toContain("input: fileURLToPath(new URL('./src/root.tsrx'");
		expect(config).toContain('ssrRender:');
		expect(config).toContain("input: fileURLToPath(new URL('./src/server.ts'");
		expect(config).not.toContain('input: {');
	});

	test.each([
		['serve', {}, 'true'],
		['flagged build', { debug: true }, 'true'],
		['default build', {}, 'false'],
	] as const)('%s defines the sole debug compile constant', (name, options, expected) => {
		const config: { define?: Record<string, unknown> } = {};
		const plugin = getPlugin(markless(options), 'vite-plugin-markless');

		callConfig(plugin, config, { command: name === 'serve' ? 'serve' : 'build' });

		expect(config.define).toEqual({
			__MARKLESS_DEBUG_ENABLED__: expected,
			__MARKLESS_DEV_ENABLED__: name === 'serve' ? 'true' : 'false',
		});
	});

	test('rejects a conflicting consumer definition with an actionable message', () => {
		const plugin = getPlugin(markless(), 'vite-plugin-markless');

		expect(() =>
			callConfig(
				plugin,
				{ define: { __MARKLESS_DEBUG_ENABLED__: 'true', KEEP: '1' } },
				{ command: 'build' },
			),
		).toThrowError(
			'MARKLESS_DEBUG_DEFINE_CONFLICT: __MARKLESS_DEBUG_ENABLED__ is controlled by markless(). Remove the consumer definition or set markless({ debug: true }).',
		);
	});

	test('rejects a conflicting consumer development definition', () => {
		const plugin = getPlugin(markless(), 'vite-plugin-markless');

		expect(() =>
			callConfig(
				plugin,
				{ define: { __MARKLESS_DEV_ENABLED__: 'true' } },
				{ command: 'build' },
			),
		).toThrowError(
			'MARKLESS_DEV_DEFINE_CONFLICT: __MARKLESS_DEV_ENABLED__ is controlled by markless(). Remove the consumer definition.',
		);
	});
});
