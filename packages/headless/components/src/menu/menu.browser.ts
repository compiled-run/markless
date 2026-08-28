import { render, renderSSR } from '@markless/vitest-browser';
import { parkPointerClearOfMount } from '../../test-support/pointer-parking.ts';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import CheckboxItems from './scenarios/checkbox-items.tsrx';
import Context from './scenarios/context.tsrx';
import ContextKeyboard from './scenarios/context-keyboard.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Deep from './scenarios/deep.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Menubar from './scenarios/menubar.tsrx';
import MenubarServed from './scenarios/menubar-served.tsrx';
import MenubarTrigger from './scenarios/menubar-trigger.tsrx';
import RadioItems from './scenarios/radio-items.tsrx';
import Submenu from './scenarios/submenu.tsrx';

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The rule set the accessibility rows hold this family to, the same one the
// cross-family conformance battery runs.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

// The gesture waits on the handler module's fetch on a served page, so the polls
// are given more than the one-second default.
const COLD_POLL = { timeout: 5000 };
// How long a row that expects NOTHING to arrive waits before saying so.
const QUIET_MS = 800;
// The family's own typeahead window, restated here so a row that waits one out says why.
const TYPEAHEAD_WINDOW = 750;
// Shorter than the family's stock 700 ms hover intent. A bar menu that arrives
// inside this budget cannot have consulted `delay`, which is the whole claim.
const DELAY_FREE = { timeout: 400 };

// The overlay behaviour keeps one module-level stack for the whole page, so a row
// that leaves a surface enlisted leaves the next row's dismissals going to it.
afterEach(async () => {
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
});

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

function text(testid: string): string {
	return el(testid).textContent ?? '';
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function press(target: Element) {
	target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

/** A click with no click count, which is what Enter and Space on a button produce. */
function activate(target: Element) {
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
}

function keyOn(target: Element, key: string, extra: KeyboardEventInit = {}) {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));
}

function hover(target: Element, from: Element | null = null) {
	target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: from }));
}

function leave(target: Element, to: Element | null) {
	target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: to }));
}

function expectHidden(content: Element, trigger: Element) {
	expect(content.hasAttribute('hidden')).toBe(true);
	expect(content.getAttribute('ui-closed')).toBe('');
	expect(content.hasAttribute('ui-open')).toBe(false);
	expect(trigger.getAttribute('aria-expanded')).toBe('false');
	expect(document.contains(content)).toBe(true);
}

function expectShowing(content: Element, trigger: Element) {
	expect(content.hasAttribute('hidden')).toBe(false);
	expect(content.getAttribute('ui-open')).toBe('');
	expect(trigger.getAttribute('aria-expanded')).toBe('true');
}

async function openByClick(triggerId = 'trigger', contentId = 'content') {
	press(el(triggerId));
	await expect.poll(() => el(contentId).hasAttribute('hidden'), COLD_POLL).toBe(false);
}

function escape() {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

/** Open one bar menu the way a keyboard does, and wait for its dropdown. */
async function openBar(barId: string, panelId: string) {
	el(barId).focus();
	keyOn(el(barId), 'ArrowDown');
	await expect.poll(() => el(panelId).hasAttribute('hidden'), COLD_POLL).toBe(false);
}

async function expectFocused(testid: string) {
	await expect.poll(() => document.activeElement, COLD_POLL).toBe(el(testid));
}

async function axeViolationIds(scope: Element): Promise<string[]> {
	const results = await axe.run(scope as HTMLElement, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		resultTypes: ['violations'],
	});
	return results.violations.map((violation) => violation.id);
}

async function expectNoAxeViolations(scope: Element, phase: string) {
	const results = await axe.run(scope as HTMLElement, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		resultTypes: ['violations'],
	});
	const reported = results.violations.map(
		(violation) =>
			`${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}\n` +
			violation.nodes.map((node) => `      ${node.html}`).join('\n'),
	);
	expect(reported, `axe ${AXE_TAGS.join('+')} violations while ${phase}`).toEqual([]);
}

async function expectNoViolation(scope: Element, phase: string) {
	expect(await axeViolationIds(scope), `axe ${AXE_TAGS.join('+')} while ${phase}`).toEqual([]);
}

type ContextProbe = {
	/** `defaultPrevented` read once per event on the way back out of the dispatch, which is what the browser itself checks. */
	readonly cancelledInDispatch: boolean[];
	readonly seen: Event[];
	readonly stop: () => void;
};

function watchContextmenu(): ContextProbe {
	const cancelledInDispatch: boolean[] = [];
	const seen: Event[] = [];
	const stash = (event: Event) => void seen.push(event);
	const readAtEnd = (event: Event) => void cancelledInDispatch.push(event.defaultPrevented);
	document.addEventListener('contextmenu', stash, true);
	window.addEventListener('contextmenu', readAtEnd, false);
	return {
		cancelledInDispatch,
		seen,
		stop: () => {
			document.removeEventListener('contextmenu', stash, true);
			window.removeEventListener('contextmenu', readAtEnd, false);
		},
	};
}

const rightClick = (testid: string) =>
	userEvent.click(page.getByTestId(testid), { button: 'right' });

for (const mode of MODES) {
	// ── The surface contract ─────────────────────────────────────────────────

	test(`${mode}: the trigger declares a collapsed menu it controls, and the surface is a named menu`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const trigger = el('trigger');
		const content = el('content');
		expect(trigger.localName).toBe('button');
		expect(trigger.getAttribute('type')).toBe('button');
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(content.id).toBeTruthy();
		expect(trigger.getAttribute('aria-controls')).toBe(content.id);
		expect(content.getAttribute('role')).toBe('menu');
		expect(content.getAttribute('aria-labelledby')).toBe(trigger.id);
		expect(content.hasAttribute('overlay')).toBe(true);
		expect(content.hasAttribute('aria-modal')).toBe(false);
		expectHidden(content, trigger);
	});

	test(`${mode}: every item is a menuitem, and a consumer's separator stays the consumer's`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		for (const id of ['item-cut', 'item-copy', 'item-paste', 'item-delete']) {
			expect(el(id).getAttribute('role'), id).toBe('menuitem');
			expect(el(id).getAttribute('tabindex'), id).toBe('-1');
			expect(el(id).hasAttribute('aria-checked'), id).toBe(false);
		}
		expect(el('separator').getAttribute('role')).toBe('separator');
		// The mirror of navbar's rule: navigation links are that family's job, and a menu never renders one.
		expect(el('content').querySelector('a[role="menuitem"]')).toBe(null);
	});

	test(`${mode}: a root drops the props it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const root = el('root');
		for (const attribute of [
			'open',
			'checked',
			'disabled',
			'loop',
			'radio',
			'delay',
			'closedelay',
		]) {
			expect(root.hasAttribute(attribute), attribute).toBe(false);
		}
	});

	// Placement is CSS, never a prop: each surface ships one default inside the
	// family's own layer, and any unlayered rule the consumer writes beats it with
	// no specificity fight.
	test(`${mode}: each surface takes its own default placement, and a consumer's rule wins`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		const content = el('content');
		const subContent = el('sub-content');
		// Chromium serialises the logical keywords back in block-then-inline order,
		// so these are `block-end span-inline-end` and `inline-end span-block-end`
		// as written in the parts' own stylesheets.
		expect(getComputedStyle(content).getPropertyValue('position-area')).toBe('end span-end');
		expect(getComputedStyle(subContent).getPropertyValue('position-area')).toBe('span-end end');

		const own = document.createElement('style');
		own.textContent = '[data-testid="content"] { position-area: block-start span-inline-end; }';
		document.head.appendChild(own);
		try {
			expect(getComputedStyle(content).getPropertyValue('position-area')).toBe('start span-end');
		} finally {
			own.remove();
		}
	});

	// ── Opening and closing by every route ───────────────────────────────────

	test(`${mode}: a click opens the menu and the next click closes it`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openByClick();
		expectShowing(el('content'), el('trigger'));

		press(el('trigger'));
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(true);
		expectHidden(el('content'), el('trigger'));
	});

	test(`${mode}: a keyboard activation opens the menu focusing its first item`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		el('trigger').focus();
		activate(el('trigger'));
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-cut');
	});

	test(`${mode}: ArrowDown opens on the first item and ArrowUp on the last`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		// The gesture that WAKES a served page cannot also be measured for where it
		// left focus: the handler runs after the demand load, and the focus it asks
		// for inside that first dispatch is refused and not replayed. One warm
		// open/close first, so what this row measures is the family's rule.
		await openByClick();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(true);

		el('trigger').focus();
		keyOn(el('trigger'), 'ArrowDown');
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-cut');

		keyOn(el('item-cut'), 'Escape');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(true);

		el('trigger').focus();
		keyOn(el('trigger'), 'ArrowUp');
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-delete');
	});

	// ── The walk ─────────────────────────────────────────────────────────────

	test(`${mode}: the arrows walk the items and wrap at both ends`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openByClick();
		el('item-cut').focus();

		keyOn(el('item-cut'), 'ArrowDown');
		await expectFocused('item-copy');
		keyOn(el('item-copy'), 'ArrowUp');
		await expectFocused('item-cut');
		// A menu wraps where a listbox stops: the deliberate divergence from select.
		keyOn(el('item-cut'), 'ArrowUp');
		await expectFocused('item-delete');
		keyOn(el('item-delete'), 'ArrowDown');
		await expectFocused('item-cut');
	});

	test(`${mode}: Home and End jump to the ends`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openByClick();
		el('item-copy').focus();
		keyOn(el('item-copy'), 'End');
		await expectFocused('item-delete');
		keyOn(el('item-delete'), 'Home');
		await expectFocused('item-cut');
	});

	test(`${mode}: typeahead moves to the item whose own words start with what was typed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openByClick();
		el('item-cut').focus();
		keyOn(el('item-cut'), 'p');
		await expectFocused('item-paste');
		// A second character inside the window EXTENDS the buffer - "pd" matches nothing, so nothing moves.
		keyOn(el('item-paste'), 'd');
		await wait(120);
		expect(document.activeElement).toBe(el('item-paste'));
		// Past the window the buffer is a fresh one.
		await wait(TYPEAHEAD_WINDOW);
		keyOn(el('item-paste'), 'd');
		await expectFocused('item-delete');
	});

	test(`${mode}: a disabled item is a destination the arrows land on and refuses activation`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);

		await openByClick();
		expect(el('item-paste').getAttribute('aria-disabled')).toBe('true');
		el('item-cut').focus();
		keyOn(el('item-cut'), 'ArrowDown');
		await expectFocused('item-paste');

		press(el('item-paste'));
		await wait(60);
		expect(text('calls')).toBe('0');
		expect(el('content').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: a disabled menu does not open`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);

		expect(el('locked-root').getAttribute('ui-disabled')).toBe('');
		expect(el<HTMLButtonElement>('locked-trigger').disabled).toBe(true);
		press(el('locked-trigger'));
		await wait(80);
		expect(el('locked-content').hasAttribute('hidden')).toBe(true);
	});

	// ── Activation ───────────────────────────────────────────────────────────

	test(`${mode}: activating a command reports its value, closes the menu and hands focus back`, async () => {
		if (mode === 'CSR') await render(Controlled);
		else await renderSSR(Controlled);

		await openByClick();
		await expect.poll(() => text('opens'), COLD_POLL).toBe('1');
		expect(text('open')).toBe('true');

		press(el('item-copy'));
		await expect.poll(() => text('last'), COLD_POLL).toBe('copy');
		expect(text('calls')).toBe('1');
		await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);
		expect(text('open')).toBe('false');
		await expectFocused('trigger');
	});

	test(`${mode}: Enter on an item activates it through the item's own rule`, async () => {
		if (mode === 'CSR') await render(Controlled);
		else await renderSSR(Controlled);

		await openByClick();
		el('item-cut').focus();
		keyOn(el('item-cut'), 'Enter');
		await expect.poll(() => text('last'), COLD_POLL).toBe('cut');
		await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);
	});

	// ── Selection items ──────────────────────────────────────────────────────

	test(`${mode}: a checked item is a menuitemcheckbox, and its checked state is served with it`, async () => {
		if (mode === 'CSR') await render(CheckboxItems);
		else await renderSSR(CheckboxItems);

		expect(el('item-wrap').getAttribute('role')).toBe('menuitemcheckbox');
		expect(el('item-minimap').getAttribute('role')).toBe('menuitemcheckbox');
		expect(el('item-reload').getAttribute('role')).toBe('menuitem');
		expect(el('item-wrap').getAttribute('aria-checked')).toBe('true');
		expect(el('item-minimap').getAttribute('aria-checked')).toBe('false');
		expect(el('item-wrap').getAttribute('ui-checked')).toBe('');
		expect(el('item-reload').hasAttribute('aria-checked')).toBe(false);
	});

	test(`${mode}: Space toggles a checkbox item and leaves the menu up`, async () => {
		if (mode === 'CSR') await render(CheckboxItems);
		else await renderSSR(CheckboxItems);

		await openByClick();
		el('item-minimap').focus();
		keyOn(el('item-minimap'), ' ');
		await expect
			.poll(() => el('item-minimap').getAttribute('aria-checked'), COLD_POLL)
			.toBe('true');
		expect(el('content').hasAttribute('hidden')).toBe(false);
		expect(text('last')).toBe('minimap');

		keyOn(el('item-minimap'), ' ');
		await expect.poll(() => el('item-minimap').getAttribute('aria-checked')).toBe('false');
		expect(el('content').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: a radio menu holds one checked value and swaps it`, async () => {
		if (mode === 'CSR') await render(RadioItems);
		else await renderSSR(RadioItems);

		for (const id of ['item-name', 'item-date', 'item-size']) {
			expect(el(id).getAttribute('role'), id).toBe('menuitemradio');
		}
		expect(el('item-name').getAttribute('aria-checked')).toBe('true');
		expect(el('group').getAttribute('role')).toBe('group');

		await openByClick();
		press(el('item-size'));
		await expect
			.poll(() => el('item-size').getAttribute('aria-checked'), COLD_POLL)
			.toBe('true');
		expect(el('item-name').getAttribute('aria-checked')).toBe('false');
		expect(text('last')).toBe('size');
		// A selection item leaves the menu up, so the next choice needs no re-open.
		expect(el('content').hasAttribute('hidden')).toBe(false);
	});

	// ── Submenus ─────────────────────────────────────────────────────────────

	test(`${mode}: a nesting item is a menuitem that declares the submenu it holds, and the submenu is named by it`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		const opener = el('sub-item');
		// role="menuitem" AND aria-haspopup: the item is still a command of the surface above it.
		expect(opener.getAttribute('role')).toBe('menuitem');
		expect(opener.getAttribute('aria-haspopup')).toBe('menu');
		expect(opener.getAttribute('aria-expanded')).toBe('false');
		expect(opener.getAttribute('aria-controls')).toBe(el('sub-content').id);
		expect(el('sub-content').getAttribute('role')).toBe('menu');
		expect(el('sub-content').getAttribute('aria-labelledby')).toBe(opener.id);
		expect(el('sub-content').hasAttribute('overlay')).toBe(true);
		// One root: the submenu is inside the item, which is inside the one menu.content.
		expect(el('content').contains(el('sub-item'))).toBe(true);
		expect(el('sub-item').contains(el('sub-content'))).toBe(true);
		expectHidden(el('sub-content'), opener);
	});

	test(`${mode}: a plain item declares no popup and no expanded state`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		for (const id of ['item-new', 'item-print']) {
			expect(el(id).hasAttribute('aria-haspopup'), id).toBe(false);
			expect(el(id).hasAttribute('aria-expanded'), id).toBe(false);
		}
	});

	test(`${mode}: the arrow walk crosses the nesting item without entering it`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('item-new').focus();
		keyOn(el('item-new'), 'ArrowDown');
		await expectFocused('sub-item');
		keyOn(el('sub-item'), 'ArrowDown');
		await expectFocused('item-print');
		expect(el('sub-content').hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: ArrowRight opens the submenu on its first item and ArrowLeft closes it back onto the item`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('sub-item').focus();
		keyOn(el('sub-item'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		expect(el('sub-item').getAttribute('aria-expanded')).toBe('true');
		await expectFocused('sub-email');

		keyOn(el('sub-email'), 'ArrowLeft');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('sub-item');
		// Only the submenu went: the surface above it is the one holding the item.
		expect(el('content').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: Enter on a nesting item opens its submenu rather than activating it`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('sub-item').focus();
		keyOn(el('sub-item'), 'Enter');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		expect(text('last')).toBe('');
		expect(el('content').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: the submenu walks its own items and the surface above it does not move`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('sub-item').focus();
		keyOn(el('sub-item'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('sub-email');

		keyOn(el('sub-email'), 'ArrowDown');
		await expectFocused('sub-link');
		// Two items in this surface, so the wrap lands back on the first rather than on an item of the menu above.
		keyOn(el('sub-link'), 'ArrowDown');
		await expectFocused('sub-email');
		keyOn(el('sub-email'), 'End');
		await expectFocused('sub-link');
	});

	test(`${mode}: typeahead in a submenu matches only that submenu's items`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('sub-item').focus();
		keyOn(el('sub-item'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('sub-email');
		// "p" is Print in the surface above; inside the submenu it matches nothing and nothing moves.
		keyOn(el('sub-email'), 'p');
		await wait(120);
		expect(document.activeElement).toBe(el('sub-email'));
		await wait(TYPEAHEAD_WINDOW);
		keyOn(el('sub-email'), 'c');
		await expectFocused('sub-link');
	});

	test(`${mode}: a resting pointer opens the submenu and leaving the item closes it`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		hover(el('sub-item'), el('item-new'));
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);

		leave(el('sub-item'), el('item-print'));
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(true);
	});

	test(`${mode}: a pointer crossing from the item into its own submenu never closes it`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		hover(el('sub-item'), el('item-new'));
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);

		// The submenu is written INSIDE the item, so this crossing is not a leave at all.
		leave(el('sub-item'), el('sub-email'));
		await wait(QUIET_MS / 4);
		expect(el('sub-content').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: activating a submenu item reports to the one root and closes the whole chain`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('sub-item').focus();
		keyOn(el('sub-item'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);

		press(el('sub-link'));
		// One onChange, the root's: the submenu has no callback of its own.
		await expect.poll(() => text('last'), COLD_POLL).toBe('link');
		await expect.poll(() => el('sub-content').hasAttribute('hidden')).toBe(true);
		await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);
		await expectFocused('trigger');
	});

	test(`${mode}: Escape closes the submenu and leaves the menu above it open`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('sub-item').focus();
		keyOn(el('sub-item'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(true);
		expect(el('content').hasAttribute('hidden')).toBe(false);
		await expectFocused('sub-item');
	});

	// ── Three levels ─────────────────────────────────────────────────────────

	test(`${mode}: three levels are the same two parts, each nesting item declaring its own surface`, async () => {
		if (mode === 'CSR') await render(Deep);
		else await renderSSR(Deep);

		for (const [item, surface] of [
			['level-1', 'content-1'],
			['level-2', 'content-2'],
		] as const) {
			expect(el(item).getAttribute('role'), item).toBe('menuitem');
			expect(el(item).getAttribute('aria-haspopup'), item).toBe('menu');
			expect(el(item).getAttribute('aria-controls'), item).toBe(el(surface).id);
			expect(el(surface).getAttribute('aria-labelledby'), surface).toBe(el(item).id);
			expect(el(surface).getAttribute('role'), surface).toBe('menu');
		}
		// Each level's ids are its own: a token shared between two item instances would collapse them.
		expect(el('level-1').id).not.toBe(el('level-2').id);
		expect(el('content-1').id).not.toBe(el('content-2').id);
		expect(el('content-1').contains(el('level-2'))).toBe(true);
	});

	test(`${mode}: ArrowRight walks three levels in and ArrowLeft walks back out one at a time`, async () => {
		if (mode === 'CSR') await render(Deep);
		else await renderSSR(Deep);

		await openByClick();
		el('level-1').focus();
		keyOn(el('level-1'), 'ArrowRight');
		await expect.poll(() => el('content-1').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-email');

		keyOn(el('item-email'), 'ArrowDown');
		await expectFocused('level-2');
		keyOn(el('level-2'), 'ArrowRight');
		await expect.poll(() => el('content-2').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-mastodon');
		expect(el('level-2').getAttribute('aria-expanded')).toBe('true');
		expect(el('level-1').getAttribute('aria-expanded')).toBe('true');

		keyOn(el('item-mastodon'), 'ArrowLeft');
		await expect.poll(() => el('content-2').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('level-2');
		// Only the deepest went.
		expect(el('content-1').hasAttribute('hidden')).toBe(false);

		keyOn(el('level-2'), 'ArrowLeft');
		await expect.poll(() => el('content-1').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('level-1');
		expect(el('content').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: the deepest surface owns its own walk, and no surface above it moves`, async () => {
		if (mode === 'CSR') await render(Deep);
		else await renderSSR(Deep);

		await openByClick();
		el('level-1').focus();
		keyOn(el('level-1'), 'ArrowRight');
		await expect.poll(() => el('content-1').hasAttribute('hidden'), COLD_POLL).toBe(false);
		keyOn(el('item-email'), 'ArrowDown');
		await expectFocused('level-2');
		keyOn(el('level-2'), 'ArrowRight');
		await expect.poll(() => el('content-2').hasAttribute('hidden'), COLD_POLL).toBe(false);

		keyOn(el('item-mastodon'), 'ArrowDown');
		await expectFocused('item-bluesky');
		// Home in the deepest surface reaches its own first item, not the menu's.
		keyOn(el('item-bluesky'), 'Home');
		await expectFocused('item-mastodon');
	});

	test(`${mode}: activating at the deepest level reports to the one root and takes all three levels down`, async () => {
		if (mode === 'CSR') await render(Deep);
		else await renderSSR(Deep);

		await openByClick();
		el('level-1').focus();
		keyOn(el('level-1'), 'ArrowRight');
		await expect.poll(() => el('content-1').hasAttribute('hidden'), COLD_POLL).toBe(false);
		keyOn(el('item-email'), 'ArrowDown');
		await expectFocused('level-2');
		keyOn(el('level-2'), 'ArrowRight');
		await expect.poll(() => el('content-2').hasAttribute('hidden'), COLD_POLL).toBe(false);

		press(el('item-bluesky'));
		await expect.poll(() => text('last'), COLD_POLL).toBe('bluesky');
		await expect.poll(() => el('content-2').hasAttribute('hidden')).toBe(true);
		await expect.poll(() => el('content-1').hasAttribute('hidden')).toBe(true);
		await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);
		await expectFocused('trigger');
	});

	test(`${mode}: Escape steps out one level at a time`, async () => {
		if (mode === 'CSR') await render(Deep);
		else await renderSSR(Deep);

		await openByClick();
		el('level-1').focus();
		keyOn(el('level-1'), 'ArrowRight');
		await expect.poll(() => el('content-1').hasAttribute('hidden'), COLD_POLL).toBe(false);
		keyOn(el('item-email'), 'ArrowDown');
		await expectFocused('level-2');
		keyOn(el('level-2'), 'ArrowRight');
		await expect.poll(() => el('content-2').hasAttribute('hidden'), COLD_POLL).toBe(false);

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('content-2').hasAttribute('hidden'), COLD_POLL).toBe(true);
		expect(el('content-1').hasAttribute('hidden')).toBe(false);
		await expectFocused('level-2');

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('content-1').hasAttribute('hidden'), COLD_POLL).toBe(true);
		expect(el('content').hasAttribute('hidden')).toBe(false);
		await expectFocused('level-1');
	});

	// ── Dismissal ────────────────────────────────────────────────────────────

	test(`${mode}: Escape closes the menu and hands focus back to the trigger`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openByClick();
		el('item-cut').focus();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('trigger');
	});

	test(`${mode}: a press outside closes the menu and moves no focus`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openByClick();
		el('background').focus();
		el('background').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(true);
		expect(document.activeElement).toBe(el('background'));
	});

	test(`${mode}: Tab closes the menu and keeps its native move`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openByClick();
		el('item-cut').focus();
		const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		el('item-cut').dispatchEvent(tab);
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(true);
		expect(tab.defaultPrevented).toBe(false);
	});

	test(`${mode}: a wheel over the page does not dismiss the menu`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openByClick();
		el('content').dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 40 }));
		await wait(QUIET_MS / 4);
		expect(el('content').hasAttribute('hidden')).toBe(false);
	});

	// ── The context menu ─────────────────────────────────────────────────────

	test(`${mode}: the context area carries no ARIA of its own`, async () => {
		if (mode === 'CSR') await render(Context);
		else await renderSSR(Context);

		const area = el('area');
		for (const attribute of ['role', 'aria-haspopup', 'aria-expanded', 'aria-controls']) {
			expect(area.hasAttribute(attribute), attribute).toBe(false);
		}
		expect(area.getAttribute('ui-closed')).toBe('');
		expect(el('content').getAttribute('aria-label')).toBe('Row actions');
		expect(el('content').hasAttribute('aria-labelledby')).toBe(false);
	});

	test(`${mode}: the first right-click opens our menu at the pointer and the browser's own is cancelled inside the dispatch`, async () => {
		const probe = watchContextmenu();
		try {
			if (mode === 'CSR') await render(Context);
			else await renderSSR(Context);

			await rightClick('area-text');
			await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
			expect(probe.cancelledInDispatch).toEqual([true]);

			const placed = el('content').getBoundingClientRect();
			const from = el('area-text').getBoundingClientRect();
			expect(el('content').getAttribute('style')).toContain('--x:');
			expect(placed.left).toBeGreaterThanOrEqual(from.left - 1);
			expect(placed.top).toBeGreaterThanOrEqual(from.top - 1);
		} finally {
			probe.stop();
		}
	});

	test(`${mode}: a right-click inside the open menu is cancelled too`, async () => {
		const probe = watchContextmenu();
		try {
			if (mode === 'CSR') await render(Context);
			else await renderSSR(Context);

			await rightClick('area-text');
			await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
			await rightClick('item-open');
			await expect.poll(() => probe.cancelledInDispatch.length, COLD_POLL).toBe(2);
			expect(probe.cancelledInDispatch).toEqual([true, true]);
		} finally {
			probe.stop();
		}
	});

	test(`${mode}: activating a context item reports it and closes the menu`, async () => {
		if (mode === 'CSR') await render(Context);
		else await renderSSR(Context);

		await rightClick('area-text');
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		press(el('item-rename'));
		await expect.poll(() => text('last'), COLD_POLL).toBe('rename');
		await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: Shift+F10 on a focused row opens the menu at that row's box`, async () => {
		if (mode === 'CSR') await render(ContextKeyboard);
		else await renderSSR(ContextKeyboard);

		el('row').focus();
		keyOn(el('row'), 'F10', { shiftKey: true });
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);

		const box = el('row').getBoundingClientRect();
		const style = el('content').getAttribute('style') ?? '';
		expect(style).toContain(`--x: ${box.left + box.width / 2}px`);
		expect(style).toContain(`--y: ${box.top + box.height / 2}px`);
		await expectFocused('item-open');
	});

	test(`${mode}: the ContextMenu key opens the menu, and Escape hands focus back to the row`, async () => {
		if (mode === 'CSR') await render(ContextKeyboard);
		else await renderSSR(ContextKeyboard);

		// The gesture that WAKES a served page cannot also be measured for where it
		// left focus: the handler runs after the demand load, and the focus it asks
		// for inside that first dispatch is refused and not replayed. One warm
		// open/close first, so what this row measures is the family's rule.
		el('row').focus();
		keyOn(el('row'), 'ContextMenu');
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(true);

		el('row').focus();
		keyOn(el('row'), 'ContextMenu');
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-open');

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('row');
	});

	test(`${mode}: a touch resting on the area opens the menu, and a drifting one does not`, async () => {
		if (mode === 'CSR') await render(Context);
		else await renderSSR(Context);

		const area = el('area-text');
		area.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				pointerType: 'touch',
				clientX: 40,
				clientY: 40,
			}),
		);
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(true);

		area.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				pointerType: 'touch',
				clientX: 40,
				clientY: 40,
			}),
		);
		area.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				pointerType: 'touch',
				clientX: 90,
				clientY: 90,
			}),
		);
		await wait(QUIET_MS);
		expect(el('content').hasAttribute('hidden')).toBe(true);
	});

	// ── The accessibility bar ────────────────────────────────────────────────

	test(`${mode}: axe finds no wcag2a/wcag21a violation on a closed and an open menu`, async () => {
		const screen = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(screen.container as Element, 'closed');
		await openByClick();
		await expectNoAxeViolations(screen.container as Element, 'open');
	});

	test(`${mode}: axe finds no violation on an open checkbox menu`, async () => {
		const screen =
			mode === 'CSR' ? await render(CheckboxItems) : await renderSSR(CheckboxItems);
		await openByClick();
		await expectNoAxeViolations(screen.container as Element, 'checkbox items open');
	});

	test(`${mode}: axe finds no violation on an open radio menu`, async () => {
		const screen = mode === 'CSR' ? await render(RadioItems) : await renderSSR(RadioItems);
		await openByClick();
		await expectNoAxeViolations(screen.container as Element, 'radio items open');
	});

	test(`${mode}: axe finds no violation on an open submenu`, async () => {
		const screen = mode === 'CSR' ? await render(Submenu) : await renderSSR(Submenu);
		await openByClick();
		el('sub-item').focus();
		keyOn(el('sub-item'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectNoViolation(screen.container as Element, 'submenu open');
	});

	test(`${mode}: axe finds no violation with all three levels open`, async () => {
		const screen = mode === 'CSR' ? await render(Deep) : await renderSSR(Deep);
		await openByClick();
		el('level-1').focus();
		keyOn(el('level-1'), 'ArrowRight');
		await expect.poll(() => el('content-1').hasAttribute('hidden'), COLD_POLL).toBe(false);
		el('level-2').focus();
		keyOn(el('level-2'), 'ArrowRight');
		await expect.poll(() => el('content-2').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectNoViolation(screen.container as Element, 'three levels open');
	});

	test(`${mode}: axe finds no violation on an open context menu`, async () => {
		const screen = mode === 'CSR' ? await render(Context) : await renderSSR(Context);
		await rightClick('area-text');
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectNoAxeViolations(screen.container as Element, 'context menu open');
	});

	// -- The menu bar ---------------------------------------------------------

	test(`${mode}: the bar is the root itself, and each bar item declares the menu it holds`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		const root = el('root');
		expect(root.getAttribute('role')).toBe('menubar');
		expect(root.getAttribute('aria-orientation')).toBe('horizontal');
		// The bar is always showing: it is not a surface, so it is neither enlisted nor hidden.
		expect(root.hasAttribute('hidden')).toBe(false);
		expect(root.hasAttribute('overlay')).toBe(false);
		// No trigger anywhere: the page's own background button sits outside the bar.
		expect(root.querySelector('button')).toBe(null);

		for (const id of ['bar-file', 'bar-edit', 'bar-view']) {
			expect(el(id).getAttribute('role'), id).toBe('menuitem');
			expect(el(id).getAttribute('aria-haspopup'), id).toBe('menu');
			expect(el(id).getAttribute('aria-expanded'), id).toBe('false');
		}
		expect(el('bar-file').getAttribute('aria-controls')).toBe(el('panel-file').id);
		expect(el('panel-file').getAttribute('role')).toBe('menu');
		expect(el('panel-file').getAttribute('aria-labelledby')).toBe(el('bar-file').id);
		expectHidden(el('panel-file'), el('bar-file'));
		// Measured on this tip rather than assumed: a plain command in a bar menu
		// emits no `aria-controls` at all, so nothing points at an id that resolves
		// to nothing and the family's accessibility bar stays at zero.
		expect(el('item-new').hasAttribute('aria-controls')).toBe(false);
	});

	test(`${mode}: a menubar root drops the flag it destructured`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		const root = el('root');
		for (const attribute of ['menubar', 'open', 'checked', 'loop', 'radio', 'delay']) {
			expect(root.hasAttribute(attribute), attribute).toBe(false);
		}
	});

	// togglegroup's rule: until a focus says which item owns the stop, every one of
	// them is tabbable - and the items inside a closed dropdown are unreachable
	// anyway, so the bar is what a Tab actually lands on.
	test(`${mode}: the bar is a tab stop, and the stop moves with the roving focus`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		for (const id of ['bar-file', 'bar-edit', 'bar-view']) {
			expect(el(id).getAttribute('tabindex'), id).toBe('0');
		}

		el('bar-edit').focus();
		await expect.poll(() => el('bar-file').getAttribute('tabindex'), COLD_POLL).toBe('-1');
		expect(el('bar-edit').getAttribute('tabindex')).toBe('0');
		expect(el('bar-view').getAttribute('tabindex')).toBe('-1');
	});

	test(`${mode}: ArrowDown opens a bar menu on its first command and ArrowUp on its last`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		await openBar('bar-file', 'panel-file');
		expectShowing(el('panel-file'), el('bar-file'));
		await expectFocused('item-new');

		escape();
		await expect.poll(() => el('panel-file').hasAttribute('hidden'), COLD_POLL).toBe(true);

		el('bar-view').focus();
		keyOn(el('bar-view'), 'ArrowUp');
		await expect.poll(() => el('panel-view').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-zoom');
	});

	test(`${mode}: Enter and Space open a bar menu on its first command`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		el('bar-edit').focus();
		keyOn(el('bar-edit'), 'Enter');
		await expect.poll(() => el('panel-edit').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-undo');

		escape();
		await expect.poll(() => el('panel-edit').hasAttribute('hidden'), COLD_POLL).toBe(true);

		el('bar-view').focus();
		keyOn(el('bar-view'), ' ');
		await expect.poll(() => el('panel-view').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-wrap');
	});

	test(`${mode}: the arrows walk the bar and wrap at both ends`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		el('bar-file').focus();
		keyOn(el('bar-file'), 'ArrowRight');
		await expectFocused('bar-edit');
		keyOn(el('bar-edit'), 'ArrowRight');
		await expectFocused('bar-view');
		keyOn(el('bar-view'), 'ArrowRight');
		await expectFocused('bar-file');
		keyOn(el('bar-file'), 'ArrowLeft');
		await expectFocused('bar-view');
		// Walking the bar opens nothing: the arrows move, and ArrowDown is what opens.
		expect(el('panel-view').hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: Home and End jump to the ends of the bar`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		el('bar-edit').focus();
		keyOn(el('bar-edit'), 'End');
		await expectFocused('bar-view');
		keyOn(el('bar-view'), 'Home');
		await expectFocused('bar-file');
	});

	test(`${mode}: typeahead moves across the bar`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		el('bar-file').focus();
		keyOn(el('bar-file'), 'v');
		await expectFocused('bar-view');
		// One buffer for the whole menu, the bar included, so a stale one starts over.
		await wait(TYPEAHEAD_WINDOW + 50);
		keyOn(el('bar-view'), 'e');
		await expectFocused('bar-edit');
	});

	// Radix's placement: the travel is answered where focus is - inside the open
	// dropdown - not on the bar item, so it works however the menu was opened.
	test(`${mode}: an arrow inside an open bar menu closes it and opens the neighbour's`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		await openBar('bar-file', 'panel-file');
		await expectFocused('item-new');

		keyOn(el('item-new'), 'ArrowRight');
		await expect.poll(() => el('panel-edit').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expect.poll(() => el('panel-file').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('item-undo');

		keyOn(el('item-undo'), 'ArrowLeft');
		await expect.poll(() => el('panel-file').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expect.poll(() => el('panel-edit').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('item-new');
	});

	test(`${mode}: Escape closes the open bar menu and hands focus back to its bar item`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		await openBar('bar-edit', 'panel-edit');
		await expectFocused('item-undo');

		escape();
		await expect.poll(() => el('panel-edit').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('bar-edit');
		// The bar is not a surface, so Escape has nothing further to take down.
		expect(el('root').getAttribute('role')).toBe('menubar');
	});

	test(`${mode}: nothing opens on hover until a bar menu is open, and then the neighbour does at once`, async () => {
		if (mode === 'CSR') await render(MenubarServed);
		else await renderSSR(MenubarServed);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		// The gesture that WAKES a served page cannot also be measured for time, so
		// the page is woken once before the delay-free budget below is asked for.
		await openBar('bar-file', 'panel-file');
		escape();
		await expect.poll(() => el('panel-file').hasAttribute('hidden'), COLD_POLL).toBe(true);

		hover(el('bar-view'));
		await wait(QUIET_MS);
		expect(el('panel-view').hasAttribute('hidden')).toBe(true);

		await openBar('bar-file', 'panel-file');
		hover(el('bar-edit'), el('bar-file'));
		await expect.poll(() => el('panel-edit').hasAttribute('hidden'), DELAY_FREE).toBe(false);
		// The one showing closes itself: the focus the neighbour takes is what its own focusout answers.
		await expect.poll(() => el('panel-file').hasAttribute('hidden'), DELAY_FREE).toBe(true);
	});

	test(`${mode}: a nested submenu under a bar menu keeps the shipped ArrowRight walk`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		await openBar('bar-file', 'panel-file');
		el('level-recent').focus();
		keyOn(el('level-recent'), 'ArrowRight');
		await expect.poll(() => el('panel-recent').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectFocused('item-draft');
		// ArrowRight opened the level below rather than travelling to the next bar menu.
		expect(el('panel-edit').hasAttribute('hidden')).toBe(true);

		keyOn(el('item-draft'), 'ArrowLeft');
		await expect.poll(() => el('panel-recent').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('level-recent');
		expect(el('panel-file').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: each bar menu hangs under its own item, where a nested one sits beside its`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		await openBar('bar-file', 'panel-file');
		el('level-recent').focus();
		keyOn(el('level-recent'), 'ArrowRight');
		await expect.poll(() => el('panel-recent').hasAttribute('hidden'), COLD_POLL).toBe(false);

		// Chromium serialises the logical keywords back in block-then-inline order.
		expect(getComputedStyle(el('panel-file')).getPropertyValue('position-area')).toBe(
			'end span-end',
		);
		expect(getComputedStyle(el('panel-recent')).getPropertyValue('position-area')).toBe(
			'span-end end',
		);
	});

	test(`${mode}: a checkbox item in a bar menu toggles and leaves the menu up`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		await openBar('bar-view', 'panel-view');
		expect(el('item-wrap').getAttribute('role')).toBe('menuitemcheckbox');
		expect(el('item-wrap').getAttribute('aria-checked')).toBe('true');

		press(el('item-wrap'));
		await expect.poll(() => el('item-wrap').getAttribute('aria-checked'), COLD_POLL).toBe('false');
		expect(text('last')).toBe('wrap');
		expect(el('panel-view').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: a command in a bar menu reports to the one root and returns focus to its bar item`, async () => {
		if (mode === 'CSR') await render(Menubar);
		else await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();

		await openBar('bar-edit', 'panel-edit');
		press(el('item-undo'));
		await expect.poll(() => text('last'), COLD_POLL).toBe('undo');
		await expect.poll(() => el('panel-edit').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('bar-edit');
	});

	test(`${mode}: a menu.trigger written under a menubar refuses at runtime`, async () => {
		let refusal: unknown;
		try {
			if (mode === 'CSR') await render(MenubarTrigger);
			else await renderSSR(MenubarTrigger);
		} catch (error) {
			refusal = error;
		}
		expect(String(refusal)).toContain('menu.trigger cannot be written under a menubar');
	});

	test(`${mode}: axe finds no wcag2a/wcag21a violation on the bar at rest`, async () => {
		const screen = mode === 'CSR' ? await render(Menubar) : await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();
		await expectNoAxeViolations(screen.container as Element, 'the bar at rest');
	});

	test(`${mode}: axe finds no violation with a bar menu and a nested submenu open`, async () => {
		const screen = mode === 'CSR' ? await render(Menubar) : await renderSSR(Menubar);
		// The bar's hover-after-open is unconditional by design, so the trusted
		// `pointerover` Chromium delivers when a tree mounts under the cursor is
		// enough to open a menu no row asked for. The shared setup parks before the
		// mount; a bar has to be parked clear of after it too.
		await parkPointerClearOfMount();
		await openBar('bar-file', 'panel-file');
		await expectNoAxeViolations(screen.container as Element, 'a bar menu open');

		el('level-recent').focus();
		keyOn(el('level-recent'), 'ArrowRight');
		await expect.poll(() => el('panel-recent').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectNoAxeViolations(screen.container as Element, 'a nested submenu open');
	});
}

// ── Resume parity ──────────────────────────────────────────────────────────

test('SSR: the served HTML already carries the roles, the wiring and the hidden surface', async () => {
	const screen = await renderSSR(Basic);
	const served = screen.container.innerHTML;
	expect(served).toContain('role="menu"');
	expect(served).toContain('role="menuitem"');
	expect(served).toContain('aria-haspopup="menu"');
	expect(served).toContain('overlay');
	expect(served).toContain('hidden');
	expect(el('content').getAttribute('aria-labelledby')).toBe(el('trigger').id);
});

test('SSR: a pending long-press timer does not throw when the page goes', async () => {
	await renderSSR(Context);
	el('area-text').dispatchEvent(
		new PointerEvent('pointerdown', {
			bubbles: true,
			pointerType: 'touch',
			clientX: 10,
			clientY: 10,
		}),
	);
	await wait(20);
	el('root').remove();
	await wait(700);
});

test('SSR: the served bar already carries its role, its items and their hidden menus', async () => {
	const screen = await renderSSR(Menubar);
	const served = screen.container.innerHTML;
	expect(served).toContain('role="menubar"');
	expect(served).toContain('aria-orientation="horizontal"');
	expect(served).toContain('role="menuitem"');
	expect(served).toContain('aria-haspopup="menu"');
	expect(served).toContain('hidden');
	// The bar is the only tab stop the served HTML offers, before any focus has said which item owns it.
	expect(served).toContain('tabindex="0"');
	expect(el('panel-file').getAttribute('aria-labelledby')).toBe(el('bar-file').id);
});
