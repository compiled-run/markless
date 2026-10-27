import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codePane } from '../../../tooling/code-blocks.ts';

const here = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

/** A demo file as its code band shows it: without the `<style>` block that only dresses the demo. */
function shown(source: string): string {
	return source.replace(/\n[ \t]*<style>[\s\S]*?<\/style>/g, '');
}

/** drink-pick.tsrx is the card itself, so its band shows the component the reader would write. */
const DRINK_PICK = `import { storage } from '@markless/core';

export default function DrinkPick() @{
	let drink = storage('docs-drink', 'tea');

	<section>
		<button class="tea" onClick={() => (drink = 'tea')}>Tea</button>
		<button class="coffee" onClick={() => (drink = 'coffee')}>Coffee</button>
		<button class="cocoa" onClick={() => (drink = 'cocoa')}>Cocoa</button>
	</section>
}
`;

const SOURCES = {
	namePicker: [{ name: 'name-picker.tsrx', code: shown(here('./name-picker.tsrx')) }],
	talliesPage: [
		{ name: 'tally.tsrx', code: shown(here('./tally-page.tsrx')) },
		{
			name: 'tallies.tsrx',
			code: shown(here('./tallies-page.tsrx')).replace('./tally-page.tsrx', './tally.tsrx'),
		},
	],
	talliesWidget: [
		{ name: 'tally.tsrx', code: shown(here('./tally-widget.tsrx')) },
		{
			name: 'tallies.tsrx',
			code: shown(here('./tallies-widget.tsrx')).replace('./tally-widget.tsrx', './tally.tsrx'),
		},
	],
	drinkPick: [{ name: 'drink-pick.tsrx', code: DRINK_PICK }],
};

describe('build preview code bands', () => {
	it('show the demo files as they are, highlighted (run with -u after editing a demo)', async () => {
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
	}, 30_000);

	it('keep the drink-pick band true to the card it describes', () => {
		const card = here('./drink-pick.tsrx');
		expect(card).toContain("storage('docs-drink', 'tea')");
		for (const drink of ['tea', 'coffee', 'cocoa'])
			expect(card).toContain(`<button class="${drink}" onClick={() => (drink = '${drink}')}>`);
	});
});
