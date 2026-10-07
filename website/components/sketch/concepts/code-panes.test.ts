import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codePane } from '../../../tooling/code-blocks.ts';

const here = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

/** A demo file as its code band shows it: without the `<style>` block that only dresses the demo. */
function shown(source: string): string {
	return source.replace(/\n[ \t]*<style>[\s\S]*?<\/style>/g, '');
}

const SOURCES = {
	pour: [{ name: 'pour.tsrx', code: shown(here('./pour.tsrx')) }],
	pourTwice: [{ name: 'pour.tsrx', code: shown(here('./pour-twice.tsrx')).replace('PourTwice', 'Pour') }],
	basket: [{ name: 'basket.tsrx', code: shown(here('./basket.tsrx')) }],
	basketMugsOnly: [{ name: 'basket.tsrx', code: shown(here('./basket-mugs-only.tsrx')).replace('BasketMugsOnly', 'Basket') }],
	mugName: [{ name: 'mug-name.tsrx', code: shown(here('./mug-name.tsrx')) }],
	noteDrawer: [{ name: 'note-drawer.tsrx', code: shown(here('./note-drawer.tsrx')) }],
};

describe('concept preview code bands', () => {
	it('show the live demo files as they are, highlighted (run with -u after editing a demo)', async () => {
		const blocks: string[] = [];
		for (const [name, files] of Object.entries(SOURCES)) {
			const panes = await Promise.all(files.map((file, index) => codePane(file, index)));
			blocks.push(`export const ${name}: readonly PreviewFile[] = ${JSON.stringify(panes)};`);
		}
		const module = `// Written by code-panes.test.ts from the demo files beside it. Run \`vp test -u\` to refresh.
import type { PreviewFile } from '../../docs/preview-card.tsrx';

${blocks.join('\n\n')}
`;
		await expect(module).toMatchFileSnapshot('./code-panes.ts');
	});
});
