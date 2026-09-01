import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { userEvent } from 'vite-plus/test/browser';
import { describe, expect, test } from 'vitest';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
//
// Two of the battery's optional checks are omitted rather than exempted, because
// the descriptor field is the skip mechanism and neither check has a subject here:
//
//   rovingKey — this family walks by `aria-activedescendant`, and DOM focus never
//   leaves the input, so a focus-containment row would pass on every page whether
//   the option roster merged or not. The highlight row below is that check with a
//   subject that can actually move.
//
//   disabled — the locked option only exists on a showing list, and the battery's
//   disabled row clicks at rest, where the list is hidden. The refusal row below
//   opens one embed first.
runMultiEmbedConformance({
	family: 'combobox',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#comboboxState'],
	interaction: {
		activate: 'trigger',
		observe: 'input',
		stateAttribute: 'aria-expanded',
		restValue: 'false',
		activeValue: 'true',
	},
});

const MODES = ['ssr', 'csr'] as const;
const QUIET_MS = 800;

function parts(testid: string, embeds = 2): HTMLElement[] {
	const found = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`));
	expect(found, `[data-testid="${testid}"] should render once per embed`).toHaveLength(embeds);
	return found;
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

for (const mode of MODES) {
	describe(`combobox multi-embed highlight and refusal (${mode})`, () => {
		const mount = async () => {
			if (mode === 'ssr') await renderSSRIslands([MultiEmbed, MultiEmbed]);
			else await renderCsrIslands([MultiEmbed, MultiEmbed]);
		};

		// Both embeds spell an option valued `basic`, and the highlight is keyed by
		// value: one merged `highlighted` cell would light both of them at once.
		test('the keyboard highlight and the typed text stay inside their embed', async () => {
			await mount();
			const inputs = parts('input');
			const basics = parts('basic');

			inputs[0]!.focus();
			await userEvent.keyboard('{ArrowDown}');

			await expect.poll(() => basics[0]!.getAttribute('ui-highlighted')).toBe('');
			expect(basics[1]!.hasAttribute('ui-highlighted')).toBe(false);
			expect(inputs[1]!.getAttribute('aria-expanded')).toBe('false');

			await userEvent.type(inputs[1]!, 'u');

			await expect.poll(() => inputs[1]!.getAttribute('aria-expanded')).toBe('true');
			expect((inputs[0] as HTMLInputElement).value).toBe('');
		});

		test('an option nobody may choose refuses the click in every embed', async () => {
			await mount();
			const premiums = parts('premium');

			await userEvent.click(parts('trigger')[0]!);
			await expect.poll(() => parts('input')[0]!.getAttribute('aria-expanded')).toBe('true');

			await userEvent.click(parts('premium-itemlabel')[0]!);
			await wait(QUIET_MS);

			expect(premiums.map((one) => one.getAttribute('aria-selected'))).toEqual([
				'false',
				'false',
			]);
		});
	});
}
