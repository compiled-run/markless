import { usePersistentCompileStore } from '@markless/compiler';
import { expect, test, vi } from 'vitest';
import { markless } from '../src/vite/index.ts';
import { callConfigResolved, getPlugin } from './helpers.ts';

vi.mock('@markless/compiler', async (original) => ({
	...(await original<typeof import('@markless/compiler')>()),
	usePersistentCompileStore: vi.fn(),
}));

const plugin = () => getPlugin(markless(), 'vite-plugin-markless');

// Without this, every unit test that hands the plugin a partial config wrote a compile store into the repo root.
test('a resolved config without a cacheDir keeps no compile store', () => {
	callConfigResolved(plugin(), { base: '/', command: 'build', root: '/workspace/app' });
	expect(usePersistentCompileStore).not.toHaveBeenCalled();
});

test('a build with a cacheDir keeps its compile store there', () => {
	callConfigResolved(plugin(), {
		base: '/',
		command: 'build',
		root: '/workspace/app',
		cacheDir: '/workspace/app/node_modules/.vite',
	});
	expect(usePersistentCompileStore).toHaveBeenCalledWith(
		expect.objectContaining({ flush: expect.any(Function) }),
	);
});
