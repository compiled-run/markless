import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Placed from './scenarios/placed.tsrx';

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
const Opener = page.getByTestId('opener');
const Closer = page.getByTestId('closer');
const Opens = page.getByTestId('opens');
const ChromeBack = page.getByTestId('chrome-back');
const ChromeForward = page.getByTestId('chrome-forward');
const ChromeClose = page.getByTestId('chrome-close');
const ChromeCount = page.getByTestId('chrome-count');
const StepTop = page.getByTestId('step-top');
const StepBottom = page.getByTestId('step-bottom');
const StepStart = page.getByTestId('step-start');
const StepEnd = page.getByTestId('step-end');
const StepDefault = page.getByTestId('step-default');
const TopForward = page.getByTestId('top-forward');

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

// A card is shown for the DOM a tick before the overlay behaviour has enlisted
// it, so every row that goes on to press or dismiss waits for both.
async function shown(locator: { element(): Element | null }) {
	await expect.poll(() => el(locator).hasAttribute('hidden')).toBe(false);
	await new Promise((resolve) => setTimeout(resolve, 20));
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
		expect(el(Root).getAttribute('ui-max')).toBe('3');
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

	test(`${mode}: the page opens and closes a controlled tour with no gesture of the family's own`, async () => {
		const { container } = mode === 'CSR' ? await render(Controlled) : await renderSSR(Controlled);
		void container;

		expect(el(StepSave).hasAttribute('hidden')).toBe(true);
		el(Opener).click();
		await shown(StepSave);
		expect(el(Root).getAttribute('ui-open')).toBe('');
		expect(el(ChromeCount).textContent?.trim()).toBe('1 of 3');

		el(Closer).click();
		await expect.poll(() => el(StepSave).hasAttribute('hidden')).toBe(true);
		// The family reports the closes it performs. This one was the page's own
		// write to `open`, so there is nothing for it to report back.
		expect(el(Closes).textContent).toBe('0');
		expect(el(Opens).textContent).toBe('0');
	});

	test(`${mode}: one set of step controls outside the cards walks every step`, async () => {
		const { container } = mode === 'CSR' ? await render(Controlled) : await renderSSR(Controlled);
		void container;

		el(Opener).click();
		await shown(StepSave);
		expect(el(ChromeBack).hasAttribute('disabled')).toBe(true);

		el(ChromeForward).click();
		await shown(StepShare);
		expect(el(StepSave).hasAttribute('hidden')).toBe(true);
		expect(el(Step).textContent).toBe('1');
		expect(el(ChromeCount).textContent?.trim()).toBe('2 of 3');
		expect(el(ChromeBack).hasAttribute('disabled')).toBe(false);

		el(ChromeBack).click();
		await shown(StepSave);
		expect(el(Step).textContent).toBe('0');
		expect(el(ChromeCount).textContent?.trim()).toBe('1 of 3');
	});

	test(`${mode}: closing from outside the card reports the step the person gave up on`, async () => {
		const { container } = mode === 'CSR' ? await render(Controlled) : await renderSSR(Controlled);
		void container;

		el(Opener).click();
		await shown(StepSave);
		el(ChromeForward).click();
		await shown(StepShare);

		el(ChromeClose).click();
		await expect.poll(() => el(StepShare).hasAttribute('hidden')).toBe(true);
		expect(el(Closes).textContent).toBe('1');
		expect(el(Step).textContent).toBe('1');
	});

	test(`${mode}: axe finds no violation in a controlled tour, closed or open`, async () => {
		const { container } = mode === 'CSR' ? await render(Controlled) : await renderSSR(Controlled);
		const where = container as unknown as HTMLElement;

		await expectNoAxeViolations(where, 'the controlled tour is closed');
		el(Opener).click();
		await shown(StepSave);
		await settled();
		await expectNoAxeViolations(where, 'the controlled tour is open');
	});

	test(`${mode}: a disabled tour shows its step and reports itself locked`, async () => {
		const { container } = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		void container;

		await shown(StepSave);
		expect(el(Root).getAttribute('ui-disabled')).toBe('');
		for (const trigger of [SaveBack, SaveForward]) {
			expect(el(trigger).hasAttribute('disabled')).toBe(true);
			expect(el(trigger).getAttribute('ui-disabled')).toBe('');
		}
	});

	test(`${mode}: neither the triggers nor the arrow keys move a disabled tour`, async () => {
		const { container } = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		void container;

		await shown(StepSave);
		el(SaveForward).click();
		const card = el<HTMLElement>(StepSave);
		card.focus();
		card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		await settled();

		expect(el(StepSave).hasAttribute('hidden')).toBe(false);
		expect(el(StepShare).hasAttribute('hidden')).toBe(true);
		expect(el(Step).textContent).toBe('0');
	});

	test(`${mode}: a disabled tour still closes, because a tour nobody can leave is a trap`, async () => {
		const { container } = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		void container;

		await shown(StepSave);
		el(SaveClose).click();
		await expect.poll(() => el(StepSave).hasAttribute('hidden')).toBe(true);
		expect(el(Closes).textContent).toBe('1');
	});

	test(`${mode}: axe finds no violation in a disabled tour showing its step`, async () => {
		const { container } = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		const where = container as unknown as HTMLElement;

		await shown(StepSave);
		await settled();
		await expectNoAxeViolations(where, 'the disabled tour shows its step');
	});

	// Placement is CSS, never a prop: the card ships one default inside the family's
	// own layer, and any unlayered rule the consumer writes beats it with no
	// specificity fight.
	test(`${mode}: every card takes the family default placement, and a consumer's rule wins`, async () => {
		const { container } = mode === 'CSR' ? await render(Placed) : await renderSSR(Placed);
		void container;

		for (const card of [StepTop, StepBottom, StepStart, StepEnd, StepDefault]) {
			expect(el(card).hasAttribute('hidden')).toBe(true);
			expect(getComputedStyle(el(card)).getPropertyValue('position-area')).toBe('block-end');
		}

		const own = document.createElement('style');
		own.textContent = '[data-testid="step-top"] { position-area: block-start; }';
		document.head.appendChild(own);
		try {
			expect(getComputedStyle(el(StepTop)).getPropertyValue('position-area')).toBe('block-start');
			expect(getComputedStyle(el(StepBottom)).getPropertyValue('position-area')).toBe('block-end');
		} finally {
			own.remove();
		}
	});

	test(`${mode}: the showing step travels as the tour walks`, async () => {
		const { container } = mode === 'CSR' ? await render(Placed) : await renderSSR(Placed);
		void container;

		el(Start).click();
		await shown(StepTop);
		expect(el(StepTop).getAttribute('ui-current')).toBe('');

		el(TopForward).click();
		await shown(StepBottom);
		expect(el(StepTop).hasAttribute('ui-current')).toBe(false);
		expect(el(StepBottom).getAttribute('ui-current')).toBe('');
		expect(el(Step).textContent).toBe('1');
	});

	test(`${mode}: axe finds no violation on a placed step`, async () => {
		const { container } = mode === 'CSR' ? await render(Placed) : await renderSSR(Placed);
		const where = container as unknown as HTMLElement;

		await expectNoAxeViolations(where, 'the placed tour is closed');
		el(Start).click();
		await shown(StepTop);
		await settled();
		await expectNoAxeViolations(where, 'the tour is on its first placed step');
	});
}
