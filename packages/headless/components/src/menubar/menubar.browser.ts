import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { parkPointerClearOfMount } from '../../test-support/pointer-parking.ts';
import Basic from './scenarios/basic.tsrx';
import InToolbar from './scenarios/in-toolbar.tsrx';
import ServedOpen from './scenarios/served-open.tsrx';
import TwoBars from './scenarios/two-bars.tsrx';

// The SSR harness rewrites a literal `renderSSR` call site, so each test must
// branch on the mode rather than take the mount by reference.
const MODES = ['CSR', 'SSR'] as const;
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

// The gesture waits on the handler module's fetch on a served page, so the polls
// are given more than the one-second default.
const COLD_POLL = { timeout: 5000 };
// How long a row that expects NOTHING to arrive waits before saying so.
const QUIET_MS = 800;
// The menu family's own typeahead window, restated so a row that waits one out says why.
const TYPEAHEAD_WINDOW = 750;
// Shorter than the menu family's stock 700 ms hover intent. A bar menu that
// arrives inside this budget cannot have consulted `delay`, which is the claim.
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

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function keyOn(target: Element, key: string) {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function hover(target: Element, from: Element | null = null) {
	target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: from }));
}

function escape() {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

const stopsOf = (testids: readonly string[]) =>
	testids.map((one) => el(one).getAttribute('tabindex'));

async function expectFocused(testid: string) {
	await expect.poll(() => document.activeElement, COLD_POLL).toBe(el(testid));
}

async function expectShowing(panelId: string) {
	await expect.poll(() => el(panelId).hasAttribute('hidden'), COLD_POLL).toBe(false);
}

async function expectClosed(panelId: string) {
	await expect.poll(() => el(panelId).hasAttribute('hidden'), COLD_POLL).toBe(true);
}

/** Enter the bar the way a Tab does: the bar never keeps focus, it hands it on. */
async function enter(rootId: string, firstId: string) {
	el(rootId).focus();
	await expectFocused(firstId);
}

/** Open one menu on the bar the way a keyboard does, and wait for its surface. */
async function openBar(triggerId: string, panelId: string) {
	el(triggerId).focus();
	keyOn(el(triggerId), 'ArrowDown');
	await expectShowing(panelId);
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

for (const mode of MODES) {
	// ── The bar and its items ────────────────────────────────────────────────

	test(`${mode}: the bar is a horizontal menubar and each menu's own trigger is one of its items`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const root = el('root');
		expect(root.getAttribute('role')).toBe('menubar');
		expect(root.getAttribute('aria-orientation')).toBe('horizontal');
		// The bar is always showing: it is not a surface, so it is neither enlisted nor hidden.
		expect(root.hasAttribute('hidden')).toBe(false);
		expect(root.hasAttribute('overlay')).toBe(false);

		for (const id of ['bar-file', 'bar-edit', 'bar-view']) {
			expect(el(id).localName, id).toBe('button');
			expect(el(id).getAttribute('role'), id).toBe('menuitem');
			expect(el(id).getAttribute('type'), id).toBe('button');
			expect(el(id).getAttribute('aria-haspopup'), id).toBe('menu');
			expect(el(id).getAttribute('aria-expanded'), id).toBe('false');
			expect(el(id).hasAttribute('ui-menubar'), id).toBe(true);
		}
		expect(el('bar-file').getAttribute('aria-controls')).toBe(el('panel-file').id);
		expect(el('panel-file').getAttribute('role')).toBe('menu');
		expect(el('panel-file').getAttribute('aria-labelledby')).toBe(el('bar-file').id);
		expect(el('panel-file').hasAttribute('ui-menubar')).toBe(true);
		expect(el('panel-file').hasAttribute('hidden')).toBe(true);
		// The menus are whole and unchanged: each keeps its own root, which carries no
		// role of its own so the triggers stay the bar's own items.
		expect(el('menu-file').hasAttribute('role')).toBe(false);
	});

	test(`${mode}: the bar is named by its label part`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const labelledby = el('root').getAttribute('aria-labelledby');
		expect(labelledby, 'the bar points at a name').toBeTruthy();
		expect(document.getElementById(labelledby ?? '')).toBe(el('label'));
		expect(el('label').textContent).toBe('Application');
		// A menu bar is not a form control, so the name is a span rather than a label.
		expect(el('label').localName).toBe('span');
	});

	test(`${mode}: the bar holds one tab stop before any gesture`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(el('root').getAttribute('tabindex')).toBe('0');
		expect(stopsOf(['bar-file', 'bar-edit', 'bar-view'])).toEqual(['-1', '-1', '-1']);
	});

	test(`${mode}: entering the bar lands on the first menu and the bar leaves the tab order`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await enter('root', 'bar-file');
		await expect.poll(() => el('bar-file').getAttribute('tabindex'), COLD_POLL).toBe('0');
		expect(stopsOf(['bar-edit', 'bar-view'])).toEqual(['-1', '-1']);
		expect(el('root').getAttribute('tabindex')).toBe('-1');
	});

	// ── Walking the bar ──────────────────────────────────────────────────────

	test(`${mode}: the arrows walk the bar, carry the stop, and wrap at both ends`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await enter('root', 'bar-file');
		keyOn(el('bar-file'), 'ArrowRight');
		await expectFocused('bar-edit');
		await expect.poll(() => el('bar-edit').getAttribute('tabindex'), COLD_POLL).toBe('0');
		expect(el('bar-file').getAttribute('tabindex')).toBe('-1');

		keyOn(el('bar-edit'), 'ArrowRight');
		await expectFocused('bar-view');
		keyOn(el('bar-view'), 'ArrowRight');
		await expectFocused('bar-file');
		keyOn(el('bar-file'), 'ArrowLeft');
		await expectFocused('bar-view');

		// Walking opens nothing: the arrows move, and ArrowDown is what opens.
		expect(el('panel-view').hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: Home and End reach the ends of the bar`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await enter('root', 'bar-file');
		keyOn(el('bar-file'), 'End');
		await expectFocused('bar-view');
		keyOn(el('bar-view'), 'Home');
		await expectFocused('bar-file');
		// The trigger's own Home/End - which open its menu when it stands alone -
		// belong to the bar here, so nothing opened.
		expect(el('panel-file').hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: typeahead moves across the bar's triggers`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await enter('root', 'bar-file');
		keyOn(el('bar-file'), 'v');
		await expectFocused('bar-view');
		await wait(TYPEAHEAD_WINDOW + 50);
		keyOn(el('bar-view'), 'e');
		await expectFocused('bar-edit');
	});

	// ── Opening, travelling, closing ─────────────────────────────────────────

	test(`${mode}: ArrowDown opens a menu on its first command and ArrowUp on its last`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openBar('bar-file', 'panel-file');
		expect(el('bar-file').getAttribute('aria-expanded')).toBe('true');
		await expectFocused('item-new');

		escape();
		await expectClosed('panel-file');

		el('bar-view').focus();
		keyOn(el('bar-view'), 'ArrowUp');
		await expectShowing('panel-view');
		await expectFocused('item-zoom');
	});

	test(`${mode}: Enter and Space open a menu on its first command`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		el('bar-edit').focus();
		el('bar-edit').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
		await expectShowing('panel-edit');
		await expectFocused('item-undo');
	});

	test(`${mode}: an arrow inside an open menu closes it and opens the neighbour's`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openBar('bar-file', 'panel-file');
		await expectFocused('item-new');

		keyOn(el('item-new'), 'ArrowRight');
		await expectShowing('panel-edit');
		await expectClosed('panel-file');
		await expectFocused('item-undo');

		keyOn(el('item-undo'), 'ArrowLeft');
		await expectShowing('panel-file');
		await expectClosed('panel-edit');
		await expectFocused('item-new');
	});

	test(`${mode}: an arrow on an open menu's own trigger travels too`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openBar('bar-edit', 'panel-edit');
		el('bar-edit').focus();
		keyOn(el('bar-edit'), 'ArrowRight');
		await expectShowing('panel-view');
		await expectClosed('panel-edit');
	});

	test(`${mode}: Escape closes the open menu and hands focus back to its trigger`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openBar('bar-edit', 'panel-edit');
		await expectFocused('item-undo');

		escape();
		await expectClosed('panel-edit');
		await expectFocused('bar-edit');
		// The bar is not a surface, so Escape has nothing further to take down.
		expect(el('root').getAttribute('role')).toBe('menubar');
	});

	test(`${mode}: a command reports to its own menu and returns focus to its trigger`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openBar('bar-edit', 'panel-edit');
		el('item-undo').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		await expect.poll(() => el('last').textContent, COLD_POLL).toBe('undo');
		await expectClosed('panel-edit');
		await expectFocused('bar-edit');
	});

	test(`${mode}: a checkbox item in a bar menu toggles and leaves the menu up`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openBar('bar-view', 'panel-view');
		expect(el('item-wrap').getAttribute('role')).toBe('menuitemcheckbox');
		expect(el('item-wrap').getAttribute('aria-checked')).toBe('true');

		el('item-wrap').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		await expect.poll(() => el('item-wrap').getAttribute('aria-checked'), COLD_POLL).toBe('false');
		expect(el('panel-view').hasAttribute('hidden')).toBe(false);
	});

	// ── The nesting below a bar menu is the menu family's own ────────────────

	test(`${mode}: a nested submenu keeps the shipped ArrowRight walk`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openBar('bar-file', 'panel-file');
		el('level-recent').focus();
		keyOn(el('level-recent'), 'ArrowRight');
		await expectShowing('panel-recent');
		await expectFocused('item-draft');
		// ArrowRight opened the level below rather than travelling to the next menu.
		expect(el('panel-edit').hasAttribute('hidden')).toBe(true);

		keyOn(el('item-draft'), 'ArrowLeft');
		await expectClosed('panel-recent');
		await expectFocused('level-recent');
		expect(el('panel-file').hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: a bar menu hangs under its trigger where a nested one sits beside its item`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openBar('bar-file', 'panel-file');
		el('level-recent').focus();
		keyOn(el('level-recent'), 'ArrowRight');
		await expectShowing('panel-recent');

		// Chromium serialises the logical keywords back in block-then-inline order.
		expect(getComputedStyle(el('panel-file')).getPropertyValue('position-area')).toBe('block-end');
		expect(getComputedStyle(el('panel-recent')).getPropertyValue('position-area')).toBe(
			'span-end end',
		);
	});

	// ── Hover ────────────────────────────────────────────────────────────────

	test(`${mode}: nothing opens on hover until a menu is open, and then the neighbour does at once`, async () => {
		if (mode === 'CSR') await render(ServedOpen);
		else await renderSSR(ServedOpen);
		await parkPointerClearOfMount();

		// The page is served with File already open, which is also what wakes it: the
		// gesture that wakes a served page cannot also be measured for time, so the
		// bar is taken back to rest before the delay-free budget below is asked for.
		// The close is a press on the trigger rather than Escape, because a surface
		// served open was never opened and so was never enlisted with the overlay
		// stack that reports Escape.
		await expectShowing('panel-file');
		el('bar-file').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		await expectClosed('panel-file');

		hover(el('bar-view'));
		await wait(QUIET_MS);
		expect(el('panel-view').hasAttribute('hidden')).toBe(true);

		await openBar('bar-file', 'panel-file');
		hover(el('bar-edit'), el('bar-file'));
		await expect.poll(() => el('panel-edit').hasAttribute('hidden'), DELAY_FREE).toBe(false);
		await expect.poll(() => el('panel-file').hasAttribute('hidden'), DELAY_FREE).toBe(true);
		await expectFocused('bar-edit');
	});

	// ── Two bars, and a menu outside every bar ───────────────────────────────

	test(`${mode}: two bars on one page keep separate rosters`, async () => {
		if (mode === 'CSR') await render(TwoBars);
		else await renderSSR(TwoBars);

		await enter('first-root', 'file');
		keyOn(el('file'), 'ArrowRight');
		await expectFocused('edit');
		// The second bar's menus are not in the first bar's roster, so the wrap comes
		// back round inside this bar.
		keyOn(el('edit'), 'ArrowRight');
		await expectFocused('file');

		await enter('second-root', 'row');
		keyOn(el('row'), 'End');
		await expectFocused('column');
		// Entering the second bar left the first bar's own stop where it was.
		expect(el('file').getAttribute('tabindex')).toBe('0');
	});

	test(`${mode}: a menu outside every bar is untouched`, async () => {
		if (mode === 'CSR') await render(TwoBars);
		else await renderSSR(TwoBars);

		const loose = el('loose');
		expect(loose.hasAttribute('role')).toBe(false);
		expect(loose.hasAttribute('tabindex')).toBe(false);
		expect(loose.hasAttribute('ui-menubar')).toBe(false);
		expect(el('panel-loose').hasAttribute('ui-menubar')).toBe(false);

		// It is not a destination in either bar's walk.
		await enter('second-root', 'row');
		keyOn(el('row'), 'End');
		await expectFocused('column');
		expect(document.activeElement).not.toBe(loose);

		// And it still opens on its own Home key, which on a bar belongs to the bar.
		loose.focus();
		keyOn(loose, 'Home');
		await expectShowing('panel-loose');
	});

	// ── A menu in a toolbar ──────────────────────────────────────────────────

	test(`${mode}: a menu inside a toolbar keeps role="button" and joins the bar's roster`, async () => {
		if (mode === 'CSR') await render(InToolbar);
		else await renderSSR(InToolbar);

		const share = el('share');
		expect(share.localName).toBe('button');
		expect(share.hasAttribute('role')).toBe(false);
		expect(share.getAttribute('aria-haspopup')).toBe('menu');
		expect(share.hasAttribute('ui-menubar')).toBe(false);
		expect(share.getAttribute('tabindex')).toBe('-1');

		await enter('root', 'print');
		keyOn(el('print'), 'ArrowRight');
		await expectFocused('share');
		keyOn(el('share'), 'ArrowRight');
		await expectFocused('export');
	});

	test(`${mode}: a menu in a toolbar still opens on its own keys`, async () => {
		if (mode === 'CSR') await render(InToolbar);
		else await renderSSR(InToolbar);

		await enter('root', 'print');
		keyOn(el('print'), 'ArrowRight');
		await expectFocused('share');
		keyOn(el('share'), 'ArrowDown');
		await expectShowing('panel-share');
		await expectFocused('item-link');
	});

	// ── Accessibility ────────────────────────────────────────────────────────

	test(`${mode}: axe finds no wcag2a/wcag21a violation on the bar at rest`, async () => {
		const screen = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(screen.container as Element, 'the bar at rest');
	});

	test(`${mode}: axe finds no violation with a bar menu and a nested submenu open`, async () => {
		const screen = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await openBar('bar-file', 'panel-file');
		await expectNoAxeViolations(screen.container as Element, 'a bar menu open');

		el('level-recent').focus();
		keyOn(el('level-recent'), 'ArrowRight');
		await expectShowing('panel-recent');
		await expectNoAxeViolations(screen.container as Element, 'a nested submenu open');
	});

	test(`${mode}: axe finds no violation on a menu inside a toolbar`, async () => {
		const screen = mode === 'CSR' ? await render(InToolbar) : await renderSSR(InToolbar);
		await expectNoAxeViolations(screen.container as Element, 'a menu in a toolbar');
	});
}

// ── Resume parity ──────────────────────────────────────────────────────────

test('SSR: the served bar already carries its role, its items and their hidden menus', async () => {
	const screen = await renderSSR(Basic);
	const served = screen.container.innerHTML;
	expect(served).toContain('role="menubar"');
	expect(served).toContain('aria-orientation="horizontal"');
	expect(served).toContain('role="menuitem"');
	expect(served).toContain('aria-haspopup="menu"');
	expect(served).toContain('hidden');
	// The bar is the page's only stop for itself before any focus has arrived.
	expect(el('root').getAttribute('tabindex')).toBe('0');
	expect(el('panel-file').getAttribute('aria-labelledby')).toBe(el('bar-file').id);
});
