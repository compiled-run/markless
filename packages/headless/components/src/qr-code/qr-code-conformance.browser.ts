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
//   rovingKey — a code is a picture; it has no walk and takes no focus.
//   disabled — it renders, it never refuses; there is no locked state to read.
//   pageScoped — the family's only cell is widget-scoped, so this scenario reads
//   no page-scoped `shared()` for the singular-cell half of the id rule.
//
// What is left is the whole of what a display family owes: its value is its own.
runMultiEmbedConformance({
	family: 'qr-code',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#qrCodeState'],
	// The string the embed is currently asking the code to carry. The row below
	// reads the drawn pattern, which is what that string is worth.
	interaction: {
		activate: 'rotate',
		observe: 'carried',
		stateAttribute: 'ui-value',
		restValue: 'https://example.com/pair/12',
		activeValue: 'https://example.com/pair/rotated',
	},
	exemptions: [
		{
			check: 'distinct-widget-ids',
			reason:
				'island composition, not this family: a component nested under the widget root ' +
				'that calls the family accessor mints a SECOND widget instance per embed, so the ' +
				'payload carries four #qrCodeState definitions for two embeds. Owned by the ' +
				'widget-scope instance path under the router island merge, not by qr-code — the ' +
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
	describe(`qr-code multi-embed pattern independence (${mode})`, () => {
		const mount = async () => {
			if (mode === 'ssr') await renderSSRIslands([MultiEmbed, MultiEmbed]);
			else await renderCsrIslands([MultiEmbed, MultiEmbed]);
		};

		// The drawn pattern, not just the value cell: the path and the viewBox are
		// separate derives over that cell, and a merged code would re-encode both
		// embeds from one rotation.
		test('rotating one embed re-encodes only its own pattern', async () => {
			await mount();
			const paths = parts('patternpath');
			const svgs = parts('patternsvg');
			const before = paths.map((one) => one.getAttribute('d'));
			const boxBefore = svgs.map((one) => one.getAttribute('viewBox'));
			expect(before[0], 'the embeds should start on the same code').toBe(before[1]);
			expect(before[0]).toBeTruthy();

			await userEvent.click(parts('rotate')[0]!);

			await expect.poll(() => paths[0]!.getAttribute('d') === before[0]).toBe(false);
			expect(paths[1]!.getAttribute('d')).toBe(before[1]);
			expect(svgs[1]!.getAttribute('viewBox')).toBe(boxBefore[1]);
		});
	});
}
