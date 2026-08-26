import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';

const Root = page.getByTestId('root');
const Backdrop = page.getByTestId('backdrop');
const Start = page.getByTestId('start');
const Step = page.getByTestId('step');
const Closes = page.getByTestId('closes');
const Share = page.getByTestId('share');
const StepSave = page.getByTestId('step-save');
const StepShare = page.getByTestId('step-share');
const StepTrash = page.getByTestId('step-trash');
const SaveCount = page.getByTestId('save-count');
const SaveForward = page.getByTestId('save-forward');
const SaveBack = page.getByTestId('save-back');
const ShareBack = page.getByTestId('share-back');
const SaveClose = page.getByTestId('save-close');

// The SSR harness rewrites a literal `renderSSR` call site, so each test branches
// on the mode rather than taking the mount by reference.
const MODES = ['CSR', 'SSR'] as const;
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

async function settled() {
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// The overlay behaviour keeps one module-level stack for the whole page, so a row
// that leaves a card enlisted leaves the next row's dismissals going to it.
afterEach(async () => {
	for (let unwind = 0; unwind < 6; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
});

async function expectNoAxeViolations(where: HTMLElement, phase: string) {
	const results = await axe.run(where, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		resultTypes: ['violations'],
	});
	expect(
		results.violations.map((one) => `${one.id}: ${one.help}`),
		`axe violations while ${phase}`,
	).toEqual([]);
}

function press(target: HTMLElement, button = 0) {
	target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button }));
	target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, button }));
}

async function openBasic() {
	el(Start).click();
	await expect.poll(() => el(StepSave).hasAttribute('hidden')).toBe(false);
	// Enlistment rides a MutationObserver callback, so the card is not on the
	// overlay stack yet on the tick that showed it.
	await new Promise((resolve) => setTimeout(resolve, 20));
}

for (const mode of MODES) {
	test(`${mode}: a closed tour is present, hidden, and holds every step`, async () => {
		const { container } = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		void container;

		expect(el(Root).getAttribute('ui-closed')).toBe('');
		expect(el(Backdrop).hasAttribute('hidden')).toBe(true);
		for (const card of [StepSave, StepShare, StepTrash]) {
			expect(el(card).getAttribute('role')).toBe('dialog');
			expect(el(card).hasAttribute('hidden')).toBe(true);
			expect(el(card).hasAttribute('overlay')).toBe(true);
			expect(el(card).getAttribute('tabindex')).toBe('-1');
			// Never, in any configuration: the overlay behaviour reads it and would
			// make the spotlighted element inert.
			expect(el(card).hasAttribute('aria-modal')).toBe(false);
			expect(el(card).hasAttribute('aria-labelledby')).toBe(true);
			expect(el(card).hasAttribute('aria-describedby')).toBe(true);
		}
		// The copy-paste error the gates measured: the root must never scope the name.
		expect(el(Root).querySelector('style')).toBe(null);
	});

	test(`${mode}: opening shows the first step alone, and closing puts it away`, async () => {
		const { container } = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		void container;

		await openBasic();
		expect(el(StepSave).hasAttribute('hidden')).toBe(false);
		expect(el(StepShare).hasAttribute('hidden')).toBe(true);
		expect(el(StepTrash).hasAttribute('hidden')).toBe(true);
		expect(el(Backdrop).hasAttribute('hidden')).toBe(false);
		expect(el(Root).getAttribute('ui-open')).toBe('');

		el(SaveClose).click();
		await expect.poll(() => el(StepSave).hasAttribute('hidden')).toBe(true);
		expect(el(Closes).textContent).toBe('1');
		expect(el(Backdrop).hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: the count comes from the cards, with no length prop anywhere`, async () => {
		const { container } = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		void container;

		await openBasic();
		expect(el(SaveCount).textContent?.trim()).toBe('1 of 3');
		expect(el(SaveCount).getAttribute('ui-max')).toBe('3');
	});

	test(`${mode}: next and prev walk the steps and report each one`, async () => {
		const { container } = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		void container;

		await openBasic();
		expect(el(SaveBack).hasAttribute('disabled')).toBe(true);

		el(SaveForward).click();
		await expect.poll(() => el(StepShare).hasAttribute('hidden')).toBe(false);
		expect(el(StepSave).hasAttribute('hidden')).toBe(true);
		expect(el(Step).textContent).toBe('1');

		el(ShareBack).click();
		await expect.poll(() => el(StepSave).hasAttribute('hidden')).toBe(false);
		expect(el(Step).textContent).toBe('0');
	});

	test(`${mode}: Escape closes the tour from anywhere`, async () => {
		const { container } = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		void container;

		await openBasic();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el(StepSave).hasAttribute('hidden')).toBe(true);
		expect(el(Closes).textContent).toBe('1');
	});

	test(`${mode}: a press outside the card closes it`, async () => {
		const { container } = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		void container;

		await openBasic();
		press(el(Share));
		await expect.poll(() => el(StepSave).hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: focus lands in the incoming card on a step change`, async () => {
		const { container } = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		void container;

		await openBasic();
		el(SaveForward).click();
		await expect.poll(() => document.activeElement).toBe(el(StepShare));
	});

	test(`${mode}: axe finds no wcag2a/wcag21a violation, closed or on any step`, async () => {
		const { container } = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		const where = container as unknown as HTMLElement;

		await expectNoAxeViolations(where, 'the tour is closed');
		await openBasic();
		await expectNoAxeViolations(where, 'on the first step');
		el(SaveForward).click();
		await expect.poll(() => el(StepShare).hasAttribute('hidden')).toBe(false);
		await settled();
		await expectNoAxeViolations(where, 'on the second step');
	});
}
