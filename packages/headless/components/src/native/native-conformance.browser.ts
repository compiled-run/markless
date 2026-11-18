import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { userEvent } from 'vite-plus/test/browser';
import { describe, expect, test } from 'vitest';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The sheet keeps no shared() state, so there is no widget definition to keep apart; rovingKey, disabled and
// pageScoped have no subject in this family.
runMultiEmbedConformance({
	family: 'native',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: [],
	interaction: {
		activate: 'opener',
		stateAttribute: 'aria-expanded',
		restValue: 'false',
		activeValue: 'true',
	},
});

for (const mode of ['ssr', 'csr'] as const) {
	describe(`native.sheet multi-embed (${mode})`, () => {
		test("one embed's opener shows its own sheet, modal, and leaves the other's hidden; Escape closes it through onChange", async () => {
			if (mode === 'ssr') await renderSSRIslands([MultiEmbed, MultiEmbed]);
			else await renderCsrIslands([MultiEmbed, MultiEmbed]);
			const sheets = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
			expect(sheets).toHaveLength(2);
			await userEvent.click(document.querySelectorAll<HTMLElement>('[data-testid="opener"]')[0]!);
			await expect.poll(() => sheets[0]!.checkVisibility()).toBe(true);
			expect(sheets[0]!.getAttribute('aria-modal')).toBe('true');
			expect(sheets[1]!.checkVisibility()).toBe(false);

			await userEvent.keyboard('{Escape}');
			await expect.poll(() => sheets[0]!.checkVisibility()).toBe(false);
			const openers = document.querySelectorAll<HTMLElement>('[data-testid="opener"]');
			await expect.poll(() => openers[0]!.getAttribute('aria-expanded')).toBe('false');
		});
	});
}
