import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { parkPointerClearOfMount } from '../../test-support/pointer-parking.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import CheckboxItems from './scenarios/checkbox-items.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Menubar from './scenarios/menubar.tsrx';
import RadioItems from './scenarios/radio-items.tsrx';
import Submenu from './scenarios/submenu.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

// Words this family needs that the shared Vocabulary in test-support/driver.ts
// does not carry yet: `menu` and `menuitem` join it with the family's conformance
// descriptor, which is a different unit's file.
const WORDS: Record<string, Record<string, string>> = {
	// measured: this reader's own output for our markup
	virtual: {
		button: 'button',
		menu: 'menu',
		menubar: 'menubar',
		horizontal: 'orientated horizontally',
		menuitem: 'menuitem',
		menuitemcheckbox: 'menuitemcheckbox',
		menuitemradio: 'menuitemradio',
		haspopup: 'has popup menu',
		expanded: 'expanded',
		collapsed: 'not expanded',
		checked: 'checked',
		notChecked: 'not checked',
		disabled: 'disabled',
	},
	// unverified against our markup
	NVDA: {
		button: 'button',
		menu: 'menu',
		menubar: 'menu bar',
		horizontal: 'horizontal',
		menuitem: 'menu item',
		menuitemcheckbox: 'check menu item',
		menuitemradio: 'radio menu item',
		haspopup: 'submenu',
		expanded: 'expanded',
		collapsed: 'collapsed',
		checked: 'checked',
		notChecked: 'not checked',
		disabled: 'unavailable',
	},
	// unverified against our markup
	VoiceOver: {
		button: 'menu button',
		menu: 'menu',
		menubar: 'menu bar',
		horizontal: 'horizontal',
		menuitem: 'menu item',
		menuitemcheckbox: 'menu item',
		menuitemradio: 'menu item',
		haspopup: 'pop up button',
		expanded: 'expanded',
		collapsed: 'collapsed',
		checked: 'checked',
		notChecked: 'unchecked',
		disabled: 'dimmed',
	},
};

const say = WORDS[sr.name] ?? WORDS.virtual;

function el(testid: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found;
}

// One scenario per test: two live menus on one page mint the same ids, so every IDREF after the first resolves to the wrong one.
async function read(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

// The reader walks what is in the tree, and a hidden surface is not in it, so the
// menu is opened before the reader starts rather than driven open through it.
async function readOpened(component: Parameters<typeof render>[0], triggerId = 'trigger') {
	const { container } = await render(component);
	el(triggerId).click();
	await expect.poll(() => el('content').hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
	await sr.start(container as unknown as HTMLElement);
}

// A menubar is always showing, so the reader can be started on the page as
// served. The pointer is parked first because the bar's hover-after-open is
// unconditional, and a tree mounting under the cursor takes a real `pointerover`.
async function readBar() {
	const { container } = await render(Menubar);
	await parkPointerClearOfMount();
	await sr.start(container as unknown as HTMLElement);
}

async function readBarOpened(barId: string, panelId: string) {
	const { container } = await render(Menubar);
	await parkPointerClearOfMount();
	el(barId).focus();
	el(barId).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
	await expect.poll(() => el(panelId).hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
});

function missing(phrase: string, facts: readonly string[]): string[] {
	const spoken = sr.segments(phrase);
	return facts.filter((fact) => fact !== '' && !spoken.includes(fact));
}

function expectConveys(phrase: string, facts: readonly string[]) {
	expect(missing(phrase, facts), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// Walk forward until an announcement conveys everything asked for; a walk that never arrives is the same defect as a wrong phrase.
async function readFor(facts: readonly string[], limit = 40): Promise<string> {
	const seen: string[] = [];
	let phrase = await sr.lastSpokenPhrase();
	for (let step = 0; step <= limit; step++) {
		seen.push(phrase);
		if (missing(phrase, facts).length === 0) return phrase;
		await sr.next();
		phrase = await sr.lastSpokenPhrase();
	}
	throw new Error(
		`${sr.name} never announced ${JSON.stringify(facts)} in ${limit} steps.\n` +
			`Transcript: ${JSON.stringify(seen, null, 1)}`,
	);
}

test('the trigger conveys a button, its own name, and a menu it has not opened', async () => {
	await read(Basic);
	expectConveys(await readFor([say.button, 'Actions']), [say.button, 'Actions', say.collapsed]);
});

test('opening the menu flips the trigger to expanded', async () => {
	await readOpened(Basic);
	expectConveys(await readFor([say.button, 'Actions']), [say.button, 'Actions', say.expanded]);
});

test('the surface is a menu, and it takes its name from the trigger that opened it', async () => {
	await readOpened(Basic);
	expect(el('content').getAttribute('role')).toBe('menu');
	expectConveys(await readFor([say.menu]), [say.menu, 'Actions']);
});

test('every command in the menu is conveyed as a menu item under its own name', async () => {
	await readOpened(Basic);
	for (const name of ['Cut', 'Copy', 'Paste', 'Delete']) {
		expectConveys(await readFor([name]), [name, say.menuitem]);
	}
});

test('a disabled item is still reached, and is conveyed as one nobody may activate', async () => {
	await readOpened(Disabled);
	expectConveys(await readFor(['Paste']), ['Paste', say.disabled]);
});

test('a checkbox item conveys its checked state, both ways', async () => {
	await readOpened(CheckboxItems);
	expectConveys(await readFor(['Word wrap']), ['Word wrap', say.menuitemcheckbox, say.checked]);
	expectConveys(await readFor(['Minimap']), ['Minimap', say.menuitemcheckbox, say.notChecked]);
});

test('a radio item conveys the radio role and which one is chosen', async () => {
	await readOpened(RadioItems);
	expectConveys(await readFor(['Name']), ['Name', say.menuitemradio, say.checked]);
	expectConveys(await readFor(['Date']), ['Date', say.menuitemradio, say.notChecked]);
});

test('a nesting item conveys that it is a menu item holding a menu, and that the menu is not open', async () => {
	await readOpened(Submenu);
	expectConveys(await readFor(['Share']), [
		'Share',
		say.menuitem,
		say.haspopup,
		say.collapsed,
	]);
});

test('opening a submenu flips its trigger to expanded and its items are conveyed', async () => {
	const { container } = await render(Submenu);
	el('trigger').click();
	await expect.poll(() => el('content').hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
	el('sub-item').focus();
	el('sub-item').dispatchEvent(
		new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
	);
	await expect
		.poll(() => el('sub-content').hasAttribute('hidden'), { timeout: 5000 })
		.toBe(false);
	await sr.start(container as unknown as HTMLElement);

	expectConveys(await readFor(['Share']), ['Share', say.expanded]);
	// Entering the submenu announces the surface under the name of the item that opened it.
	expectConveys(await readFor([say.menu, 'Share']), [say.menu, 'Share']);
	expectConveys(await readFor(['Email']), ['Email', say.menuitem]);
});

test('the submenu is a menu named by its own item, and its item is the one that carries the popup', async () => {
	const { container } = await render(Submenu);
	el('trigger').click();
	await expect.poll(() => el('content').hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
	el('sub-item').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
	await expect
		.poll(() => el('sub-content').hasAttribute('hidden'), { timeout: 5000 })
		.toBe(false);
	await sr.start(container as unknown as HTMLElement);

	expect(el('sub-content').getAttribute('role')).toBe('menu');
	expect(el('sub-content').getAttribute('aria-labelledby')).toBe(el('sub-item').id);
	expect(el('sub-item').getAttribute('aria-haspopup')).toBe('menu');
	// A plain command in the same menu carries neither, so the popup is the nesting item's alone.
	expect(el('item-new').hasAttribute('aria-haspopup')).toBe(false);
	expect(el('item-new').hasAttribute('aria-expanded')).toBe(false);
});

test('Escape in a submenu returns to the item that opened it, which conveys the menu closed again', async () => {
	const { container } = await render(Submenu);
	el('trigger').click();
	await expect.poll(() => el('content').hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
	el('sub-item').focus();
	el('sub-item').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
	await expect
		.poll(() => el('sub-content').hasAttribute('hidden'), { timeout: 5000 })
		.toBe(false);

	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await expect.poll(() => el('sub-content').hasAttribute('hidden'), { timeout: 5000 }).toBe(true);
	await expect.poll(() => document.activeElement, { timeout: 5000 }).toBe(el('sub-item'));
	await sr.start(container as unknown as HTMLElement);

	expectConveys(await readFor(['Share']), ['Share', say.menuitem, say.collapsed]);
});

test('the bar is conveyed as a menu bar under its own name, on its own axis', async () => {
	await readBar();
	expect(el('root').getAttribute('role')).toBe('menubar');
	// Measured: this reader speaks the role, the name and the axis, and no count -
	// how many menus the bar holds is what walking it conveys, which is the row below.
	expectConveys(await readFor([say.menubar]), [say.menubar, 'Application', say.horizontal]);
	expect(el('root').querySelectorAll(':scope > [role="menuitem"]')).toHaveLength(3);
});

test('every menu on the bar is conveyed as a menu item that holds a menu', async () => {
	await readBar();
	for (const name of ['File', 'Edit', 'View']) {
		expectConveys(await readFor([name, say.menuitem]), [name, say.menuitem, say.haspopup]);
	}
});

test('opening a bar menu flips its item to expanded and announces the menu under its name', async () => {
	await readBarOpened('bar-file', 'panel-file');
	expectConveys(await readFor(['File', say.expanded]), ['File', say.menuitem, say.expanded]);
	expectConveys(await readFor([say.menu, 'File']), [say.menu, 'File']);
	expectConveys(await readFor(['New']), ['New', say.menuitem]);
});
