import { expect, test } from 'vitest';
import type { Plugin } from 'vite';
import { router } from '../../src/vite/index.ts';

test('preload planning terminates for circular packed module imports', () => {
	const plugin = (router().flat(Infinity) as Plugin[]).find(
		(plugin) => plugin.name === 'markless-router:vite',
	)!;
	const config = plugin.configResolved as Function;
	config({ root: '/project', base: '/' });
	const hook =
		typeof plugin.generateBundle === 'function'
			? plugin.generateBundle
			: plugin.generateBundle!.handler;
	const chunk = (fileName: string, moduleIds: string[], imports: string[]) => ({
		type: 'chunk',
		fileName,
		moduleIds,
		imports,
		dynamicImports: [],
		code: '',
	});
	expect(() =>
		hook.call(
			{ environment: { config: { consumer: 'client' } } } as never,
			{} as never,
			{
				'page.js': chunk('page.js', ['/project/pages/example.tsrx'], ['shared.js']),
				'shared.js': chunk('shared.js', [], ['page.js']),
			} as never,
			false,
		),
	).not.toThrow();
});
