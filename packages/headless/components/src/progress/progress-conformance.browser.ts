import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { userEvent } from 'vite-plus/test/browser';
import { describe, expect, test } from 'vitest';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
//
// A display family, so three of the battery's optional checks are omitted rather
// than exempted — the descriptor field IS the skip mechanism, and none of these
// has a subject in this family:
//
//   rovingKey — a progress bar has no walk and takes no focus.
//   disabled — a bar reports, it never refuses; there is no locked state to read.
//   pageScoped — the family's only cell is widget-scoped, so this scenario reads
//   no page-scoped `shared()` for the singular-cell half of the id rule.
//
// What is left is the whole of what a display family owes: its value is its own.
runMultiEmbedConformance({
	family: 'progress',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#progressState'],
	interaction: {
		activate: 'advance',
		observe: 'root',
		stateAttribute: 'aria-valuenow',
		restValue: '30',
		activeValue: '70',
	},
	exemptions: [
		{
			check: 'distinct-widget-ids',
			reason:
				'island composition, not this family: a component nested under the widget root ' +
				'that calls the family accessor mints a SECOND widget instance per embed, so the ' +
				'payload carries four #progressState definitions for two embeds. Owned by the ' +
				'widget-scope instance path under the router island merge, not by progress — the ' +
				'same shape resolves to one instance on a single mount.',
		},
	],
});

const MODES = ['ssr', 'csr'] as const;

function parts(testid: string, embeds = 2): HTMLElement[] {
	const found = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`));
	expect(found, `[data-testid="${testid}"] should render once per embed`).toHaveLength(embeds);
	return found;
}

for (const mode of MODES) {
	describe(`progress multi-embed value independence (${mode})`, () => {
		const mount = async () => {
			if (mode === 'ssr') await renderSSRIslands([MultiEmbed, MultiEmbed]);
			else await renderCsrIslands([MultiEmbed, MultiEmbed]);
		};

		// Everything derived from the value, not just the number: the percentage a
		// reader hears and the text the bar shows come off separate computed cells,
		// and a merged bar would move all of them in both embeds at once.
		test('one embed advancing leaves every other reporting its own value', async () => {
			await mount();
			const roots = parts('root');
			const labels = parts('valuelabel');
			expect(labels.map((one) => one.textContent?.trim())).toEqual(['30%', '30%']);

			await userEvent.click(parts('advance')[0]!);

			await expect.poll(() => labels[0]!.textContent?.trim()).toBe('70%');
			expect(labels[1]!.textContent?.trim()).toBe('30%');
			expect(roots[1]!.getAttribute('aria-valuetext')).toBe('30%');
			expect(roots[1]!.getAttribute('ui-value')).toBe('30');
			expect(roots.map((one) => one.getAttribute('ui-progress'))).toEqual([
				'loading',
				'loading',
			]);
		});
	});
}
