import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { userEvent } from 'vite-plus/test/browser';
import { describe, expect, test } from 'vitest';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'select',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#selectState'],
	// The scenario hands both embeds over open, so the gesture that moves the open
	// cell is the one that closes it. Opening isolation is the extra row below.
	interaction: {
		activate: 'trigger',
		stateAttribute: 'aria-expanded',
		restValue: 'true',
		activeValue: 'false',
	},
	rovingKey: '{ArrowDown}',
	// The last walkable option: the ends do not wrap, so a step past this one stays
	// here unless the option roster merged, in which case it lands in embed 1.
	rovingFrom: 'cherry',
	// The gesture is aimed at the option's label, not the option: the option is
	// `aria-disabled`, and the label is the child a pointer reaches inside it.
	disabled: { control: 'banana-itemlabel', observe: 'banana', stateAttribute: 'ui-selected' },
});

const MODES = ['ssr', 'csr'] as const;

function parts(testid: string, embeds = 2): HTMLElement[] {
	const found = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`));
	expect(found, `[data-testid="${testid}"] should render once per embed`).toHaveLength(embeds);
	return found;
}

for (const mode of MODES) {
	describe(`select multi-embed open state and typeahead (${mode})`, () => {
		const mount = async () => {
			if (mode === 'ssr') await renderSSRIslands([MultiEmbed, MultiEmbed]);
			else await renderCsrIslands([MultiEmbed, MultiEmbed]);
		};

		test('opening one embed leaves every other listbox closed', async () => {
			await mount();
			const triggers = parts('trigger');

			for (const trigger of triggers) await userEvent.click(trigger);
			await expect
				.poll(() => triggers.map((one) => one.getAttribute('aria-expanded')))
				.toEqual(['false', 'false']);

			await userEvent.click(triggers[0]!);

			await expect.poll(() => triggers[0]!.getAttribute('aria-expanded')).toBe('true');
			expect(triggers[1]!.getAttribute('aria-expanded')).toBe('false');
		});

		// Typed from the SECOND embed on purpose: the typeahead lands on the first
		// matching option in document order, so a merged roster escapes backwards.
		test('typeahead lands on a match inside the embed it was typed in', async () => {
			await mount();
			const frames = parts('frame');
			const cherries = parts('cherry');

			parts('apple')[1]!.focus();
			await userEvent.keyboard('c');

			await expect.poll(() => document.activeElement).toBe(cherries[1]!);
			expect(frames[0]!.contains(document.activeElement)).toBe(false);
		});
	});
}
