import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { userEvent } from 'vite-plus/test/browser';
import { describe, expect, test } from 'vitest';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
//
// `widgetDefinitionSuffixes` is empty because these primitives hold no `shared()`
// cell at all — a button's pressed state is a plain `state()` local to the part —
// so there is no family-specific widget id to name. The family-agnostic half of
// that check, which refuses any widget-scoped id repeated across the embeds, still
// runs over the merged payload.
//
// `rovingKey` is omitted rather than exempted: the primitives are single elements
// with no roster and no walk between them.
runMultiEmbedConformance({
	family: 'base',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: [],
	// The wrapper reports whether the click got out of the button at all, which is
	// the one thing observable from outside a part that spreads nothing onto its
	// element. The row below reads the primitive's own `aria-pressed`.
	interaction: {
		activate: 'mute',
		stateAttribute: 'ui-pressed',
		restValue: null,
		activeValue: '',
	},
	// Aimed at the wrapper, not the button: a natively disabled button is one a
	// pointer driver refuses to target, so the gesture would only witness its
	// actionability wait rather than the refusal.
	disabled: { control: 'locked', stateAttribute: 'ui-pressed' },
});

const MODES = ['ssr', 'csr'] as const;

function parts(testid: string, embeds = 2): HTMLElement[] {
	const found = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`));
	expect(found, `[data-testid="${testid}"] should render once per embed`).toHaveLength(embeds);
	return found;
}

function buttonsIn(testid: string): HTMLButtonElement[] {
	return parts(testid).map((wrapper) => {
		const button = wrapper.querySelector('button');
		if (!button) throw new Error(`Expected a button under [data-testid="${testid}"].`);
		return button;
	});
}

for (const mode of MODES) {
	describe(`base multi-embed press isolation (${mode})`, () => {
		const mount = async () => {
			if (mode === 'ssr') await renderSSRIslands([MultiEmbed, MultiEmbed]);
			else await renderCsrIslands([MultiEmbed, MultiEmbed]);
		};

		// The primitive's own cell, read off the button rather than off the wrapper
		// the consumer callback writes: this is the state under every family in the
		// package, so a merge here leaks fleet-wide.
		test('the pressed state on the button itself stays inside its embed', async () => {
			await mount();
			const mutes = buttonsIn('mute');
			expect(mutes.map((one) => one.getAttribute('aria-pressed'))).toEqual([
				'false',
				'false',
			]);

			await userEvent.click(mutes[0]!);

			await expect.poll(() => mutes[0]!.getAttribute('aria-pressed')).toBe('true');
			expect(mutes[1]!.getAttribute('aria-pressed')).toBe('false');
			expect(mutes[1]!.hasAttribute('ui-pressed')).toBe(false);
		});

		// A key reaches the flip by a different route than a press — the native
		// button synthesises the click — so the refusal has to hold on both, in
		// every embed.
		test('a button nobody may press refuses the keyboard in every embed', async () => {
			await mount();
			const lockedButtons = buttonsIn('locked');

			for (const button of lockedButtons) {
				button.focus();
				await userEvent.keyboard('{Enter}');
				await userEvent.keyboard(' ');
			}
			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(lockedButtons.map((one) => one.getAttribute('aria-pressed'))).toEqual([
				'false',
				'false',
			]);
			expect(parts('locked').map((one) => one.hasAttribute('ui-pressed'))).toEqual([
				false,
				false,
			]);
		});
	});
}
