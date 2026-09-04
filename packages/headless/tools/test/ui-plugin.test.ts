import type { IconifyJSON } from '@iconify/types';
import { describe, expect, test, vi } from 'vitest';
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
});
