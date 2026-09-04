import type { IconifyJSON } from '@iconify/types';
import type { ResolvedConfig } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import { compileTsrxModule } from '../../../compiler/src/index.ts';
import { ui, type UiOptions } from '../src/vite.ts';

const collection: IconifyJSON = {
	prefix: 'lucide',
	width: 24,
	height: 24,
	icons: {
		check: { body: '<path d="m5 12 4 4L19 6"/>' },
	},
};

function transformer(options: UiOptions = {}) {
	const plugin = ui(options);
	const transform = plugin.transform as {
		handler(code: string, id: string): Promise<{ code: string; map: unknown } | undefined>;
	};
	return transform.handler.bind({ warn: vi.fn(), info: vi.fn() });
}

describe('ui plugin', () => {
	test('excludes @markless/ui from dependency optimization', () => {
		const config = ui().config;
		if (typeof config !== 'function') throw new Error('Expected a config hook.');

		expect(config.call({} as never, {} as never, {} as never)).toEqual({
			optimizeDeps: { exclude: ['@markless/ui'] },
		});
	});

	test.each([
		['@markless/ui', '/src/App.tsrx'],
		['@markless/icons', '/src/App.tsrx'],
		['@markless/ui', '/src/page.mdx'],
		['@markless/icons', '/src/page.mdx'],
	])('rewrites icons imported from %s in %s', async (importSource, filename) => {
		const transform = transformer({
			icons: {
				availableCollections: ['lucide'],
				collections: { lucide: collection },
			},
		});
		const source = `import { lucide } from '${importSource}';\n\n<lucide.check />`;

		const result = await transform(source, filename);

		expect(result?.code).toContain('<svg');
		expect(result?.code).toContain('<path d="m5 12 4 4L19 6"/>');
		expect(result?.code).not.toContain('<lucide.check />');
	});

	test('leaves icon tags alone when icons are disabled', async () => {
		const transform = transformer({ icons: false });
		const source = "import { lucide } from '@markless/ui';\n\n<lucide.check />";

		expect(await transform(source, '/src/App.tsrx')).toBeUndefined();
	});
	test('ui() refuses a config where the markless plugin resolves before it', () => {
		const hook = ui().configResolved;
		if (typeof hook !== 'function') throw new Error('Expected a configResolved hook.');

		expect(() =>
			hook.call(
				undefined as never,
				resolvedWith(['vite-plugin-markless', '@markless/ui-tools']),
			),
		).toThrow(/ui\(\) from '@markless\/ui\/vite' before markless\(\)/);
	});

	test.each([
		['ui() first', ['@markless/ui-tools', 'vite-plugin-markless']],
		['ui() alone', ['@markless/ui-tools']],
	])('ui() accepts a config with %s', (_case, names) => {
		const hook = ui().configResolved;
		if (typeof hook !== 'function') throw new Error('Expected a configResolved hook.');

		expect(() => hook.call(undefined as never, resolvedWith(names))).not.toThrow();
	});

	test('a family and a pack imported together survive as an inline svg beside untouched parts', async () => {
		const transform = transformer({
			icons: {
				availableCollections: ['lucide'],
				collections: { lucide: collection },
			},
		});
		const source = [
			"import { accordion, lucide } from '@markless/ui';",
			'',
			'export default function App() @{',
			'\t<accordion.root>',
			'\t\t<accordion.item value="one">',
			'\t\t\t<accordion.trigger>Open <lucide.check /></accordion.trigger>',
			'\t\t\t<accordion.content>Body</accordion.content>',
			'\t\t</accordion.item>',
			'\t</accordion.root>',
			'}',
		].join('\n');

		const result = await transform(source, '/src/App.tsrx');
		expect(result?.code).toContain("import { accordion } from '@markless/ui'");
		expect(result?.code).toContain('<accordion.trigger>');

		const compiled = await compileTsrxModule({
			filename: '/src/App.tsrx',
			source: result!.code,
			symbols: [],
		});
		// Static markup rides JSON-encoded inside the render-data module; read it unescaped.
		const emitted = [
			compiled.publicRenderModule.renderDataModuleSource,
			compiled.publicRenderModule.ssrModuleSource,
		]
			.join('\n')
			.replaceAll('\\"', '"');

		expect(emitted).toContain('<svg width="1em" height="1em"');
		expect(emitted).toContain('<path d="m5 12 4 4L19 6">');
		expect(emitted).toContain('accordion.trigger');
		expect(emitted).not.toContain('lucide');
	});
});

function resolvedWith(names: readonly string[]): ResolvedConfig {
	return { plugins: names.map((name) => ({ name })) } as unknown as ResolvedConfig;
}
