import { describe, expect, it } from 'vitest';
import { codePanelChrome, playgroundModule, type DemoAnalysis } from './ui-playground.ts';

it('keeps scenario editing outside the file tabs widget', () => {
	const chrome = codePanelChrome({
		scenario: 'accordion/basic',
		panes: [{ value: 'source', label: 'basic.tsrx', markup: 'source' }],
		bar: '<select.root class="pg-bar-pick">Scenario</select.root>',
		indent: '',
	});
	expect(chrome.indexOf('</select.root>')).toBeLessThan(chrome.indexOf('<tabs.root'));
});

describe('playground source preview', () => {
	it.each([
		[
			'accordion',
			"import { accordion } from '@markless/ui';\n\nexport default function Questions() @{\n\tconst name = 'Shipping';\n\n",
		],
		[
			'collapsible',
			"import { collapsible } from '@markless/ui';\nexport default function Details() @{\n",
		],
	])(
		'starts the %s preview at its root and preserves the complete source for expansion',
		(family, prelude) => {
			const body = `\t<${family}.root>\n\t\tHello\n\t</${family}.root>\n}`;
			const source = prelude + body;
			const demo: DemoAnalysis = {
				family,
				stem: 'basic',
				file: '/site/basic.tsrx',
				source,
				tag: `${family}.root`,
				openingStart: prelude.length + 1,
				openingEnd: prelude.length + body.indexOf('>') + 1,
				selfClosing: false,
				childrenStart: 0,
				childrenEnd: 0,
				closing: `</${family}.root>`,
				attributes: [],
				css: '',
				itemValues: [],
				prelude: '',
			};
			const generated = playgroundModule({
				demo,
				meta: {
					family,
					quick: [],
					showAll: [],
					keyboard: [],
					examples: [],
					presets: [{ name: 'basic', label: 'Basic', values: {} }],
				},
				controls: [],
				slots: [],
				docs: [],
				colourCss: '',
				chromeCss: '',
				sourceLabel: 'basic.tsrx',
				cssLabel: `${family}.css`,
				cssLines: [],
				sourceLines: source.split('\n').map((text, index) => ({
					id: String(index),
					runs: [{ id: String(index), text }],
				})),
			});
			const readLines = (prefix: string) => {
				const match = generated.match(
					new RegExp(`const ${prefix}0: readonly Line\\[\\] = (.*);`),
				);
				expect(match).not.toBeNull();
				return JSON.parse(match![1]).map((line: { runs: { text: string }[] }) =>
					line.runs.map((run) => run.text).join(''),
				);
			};
			const context = readLines('srcContext');
			const preview = readLines('srcLines');
			expect(preview[0]).toBe(`\t<${family}.root>`);
			expect([...context, ...preview].join('\n')).toBe(source);
			expect(generated).toContain('<span class="pg-source-context">');
		},
	);
});
