import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import CheckboxItems from './scenarios/checkbox-items.tsrx';
import Context from './scenarios/context.tsrx';
import ContextKeyboard from './scenarios/context-keyboard.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Disabled from './scenarios/disabled.tsrx';
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

async function expectFocused(testid: string) {
	await expect.poll(() => document.activeElement, COLD_POLL).toBe(el(testid));
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
		expect(content.getAttribute('ui-side')).toBe('bottom');
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
			'side',
			'delay',
			'closedelay',
		]) {
			expect(root.hasAttribute(attribute), attribute).toBe(false);
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

	test(`${mode}: a submenu trigger is an item of the menu above it and declares its own surface`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		const opener = el('sub-trigger');
		expect(opener.getAttribute('role')).toBe('menuitem');
		expect(opener.getAttribute('aria-haspopup')).toBe('menu');
		expect(opener.getAttribute('aria-expanded')).toBe('false');
		expect(opener.getAttribute('aria-controls')).toBe(el('sub-content').id);
		expect(el('sub-content').getAttribute('role')).toBe('menu');
		// The surface names itself after whichever opener this instance has. Both handles
		// are written into the idref list because a part cannot choose between them, and
		// the one this instance never rendered is an id that resolves to nothing - inert
		// for the platform, and no axe violation (measured by the submenu axe row).
		expect((el('sub-content').getAttribute('aria-labelledby') ?? '').split(' ')).toContain(
			opener.id,
		);
		// The nested root is its own instance: two roots of one family on one page.
		expect(el('root').contains(el('sub-root'))).toBe(true);
	});

	test(`${mode}: the arrow walk crosses the submenu trigger without entering it`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('item-new').focus();
		keyOn(el('item-new'), 'ArrowDown');
		await expectFocused('sub-trigger');
		keyOn(el('sub-trigger'), 'ArrowDown');
		await expectFocused('item-print');
		expect(el('sub-content').hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: ArrowRight opens the submenu on its first item and ArrowLeft closes it back onto the trigger`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('sub-trigger').focus();
		keyOn(el('sub-trigger'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		expect(el('sub-trigger').getAttribute('aria-expanded')).toBe('true');
		await expectFocused('sub-email');

		keyOn(el('sub-email'), 'ArrowLeft');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(true);
		await expectFocused('sub-trigger');
		// Only the submenu went: the menu above it is the one holding the trigger.
		expect(el('content').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: a resting pointer opens the submenu and leaving it closes it`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		hover(el('sub-trigger'), el('item-new'));
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);

		leave(el('sub-root'), el('item-print'));
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(true);
	});

	test(`${mode}: activating a submenu item closes the whole chain`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('sub-trigger').focus();
		keyOn(el('sub-trigger'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);

		press(el('sub-link'));
		await expect.poll(() => text('sub'), COLD_POLL).toBe('link');
		await expect.poll(() => el('sub-content').hasAttribute('hidden')).toBe(true);
		await expect.poll(() => el('content').hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: Escape closes the submenu and leaves the menu above it open`, async () => {
		if (mode === 'CSR') await render(Submenu);
		else await renderSSR(Submenu);

		await openByClick();
		el('sub-trigger').focus();
		keyOn(el('sub-trigger'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(true);
		expect(el('content').hasAttribute('hidden')).toBe(false);
		await expectFocused('sub-trigger');
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
			expect(el('content').getAttribute('style')).toContain('position: fixed');
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
		expect(style).toContain(`left: ${box.left + box.width / 2}px`);
		expect(style).toContain(`top: ${box.top + box.height / 2}px`);
		await expectFocused('item-open');
	});

	test(`${mode}: the ContextMenu key opens the menu, and Escape hands focus back to the row`, async () => {
		if (mode === 'CSR') await render(ContextKeyboard);
		else await renderSSR(ContextKeyboard);

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
		el('sub-trigger').focus();
		keyOn(el('sub-trigger'), 'ArrowRight');
		await expect.poll(() => el('sub-content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectNoAxeViolations(screen.container as Element, 'submenu open');
	});

	test(`${mode}: axe finds no violation on an open context menu`, async () => {
		const screen = mode === 'CSR' ? await render(Context) : await renderSSR(Context);
		await rightClick('area-text');
		await expect.poll(() => el('content').hasAttribute('hidden'), COLD_POLL).toBe(false);
		await expectNoAxeViolations(screen.container as Element, 'context menu open');
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
