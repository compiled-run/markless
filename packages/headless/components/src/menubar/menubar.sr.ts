import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a
// reader product's wording.
const sr = virtualDriver;

// Words this family needs that the shared Vocabulary in test-support/driver.ts
// does not carry yet: `menubar`, `menu` and `menuitem` join it with the family's
// conformance descriptor, which is the registration unit's file.
const WORDS: Record<string, Record<string, string>> = {
	// measured: this reader's own output for our markup
	virtual: {
		menubar: 'menubar',
		horizontal: 'orientated horizontally',
		menu: 'menu',
		menuitem: 'menuitem',
		haspopup: 'has popup menu',
		expanded: 'expanded',
		collapsed: 'not expanded',
	},
	// unverified against our markup
	NVDA: {
		menubar: 'menu bar',
		horizontal: 'horizontal',
		menu: 'menu',
		menuitem: 'menu item',
		haspopup: 'submenu',
		expanded: 'expanded',
		collapsed: 'collapsed',
	},
	// unverified against our markup
	VoiceOver: {
		menubar: 'menu bar',
		horizontal: 'horizontal',
		menu: 'menu',
		menuitem: 'menu item',
		haspopup: 'pop up button',
		expanded: 'expanded',
		collapsed: 'collapsed',
	},
};

const say = WORDS[sr.name] ?? WORDS.virtual;

function el(testid: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found;
}

// The bar is always showing, so the reader can be started on the page as served.
async function readBar() {
	const { container } = await render(Basic);
	await sr.start(container as unknown as HTMLElement);
}

// A hidden surface is not in the tree the reader walks, so the menu is opened
// before the reader starts rather than driven open through it.
async function readBarOpened(triggerId: string, panelId: string) {
	const { container } = await render(Basic);
	el(triggerId).focus();
	el(triggerId).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
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

// An empty phrase is a reader with no word for the fact, not a fact it omitted.
function missing(phrase: string, facts: readonly string[]): string[] {
	const spoken = sr.segments(phrase);
	return facts.filter((fact) => fact !== '' && !spoken.includes(fact));
}

function expectConveys(phrase: string, facts: readonly string[]) {
	expect(missing(phrase, facts), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// Walk forward until an announcement conveys everything asked for; a walk that
// never arrives is the same defect as a wrong phrase.
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

test('the bar is conveyed as a menu bar under its own name, on its own axis', async () => {
	await readBar();
	expect(el('root').getAttribute('role')).toBe('menubar');
	expectConveys(await readFor([say.menubar]), [say.menubar, 'Application', say.horizontal]);
});

test("every menu on the bar is conveyed as a menu item that holds a menu", async () => {
	await readBar();
	for (const name of ['File', 'Edit', 'View']) {
		expectConveys(await readFor([name, say.menuitem]), [name, say.menuitem, say.haspopup]);
	}
});

test('moving across the bar announces each menu as one that has a submenu', async () => {
	await readBar();
	el('bar-file').focus();
	expectConveys(await sr.settleOnFocus(), ['File', say.menuitem, say.haspopup, say.collapsed]);

	el('bar-file').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
	await expect.poll(() => document.activeElement, { timeout: 5000 }).toBe(el('bar-edit'));
	expectConveys(await sr.settleOnFocus(), ['Edit', say.menuitem, say.haspopup, say.collapsed]);
});

test('opening a menu flips its trigger to expanded and announces the menu under its name', async () => {
	await readBarOpened('bar-file', 'panel-file');
	expectConveys(await readFor(['File', say.expanded]), ['File', say.menuitem, say.expanded]);
	expectConveys(await readFor([say.menu, 'File']), [say.menu, 'File']);
	expectConveys(await readFor(['New']), ['New', say.menuitem]);
});
