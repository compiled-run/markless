import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import { Basic } from './scenarios/basic.tsrx';
import { LongOpenList } from './scenarios/long-open-list.tsrx';
import { OpenList } from './scenarios/open-list.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { SignupForm } from './scenarios/signup-form.tsrx';
import { UnavailableOptions } from './scenarios/unavailable-options.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

// Words this family needs that the shared Vocabulary in test-support/driver.ts does not carry yet.
const WORDS: Record<string, Record<string, string>> = {
	// measured: this reader's own output for our markup
	virtual: {
		combobox: 'combobox',
		listbox: 'listbox',
		option: 'option',
		selected: 'selected',
		notSelected: 'not selected',
		expanded: 'expanded',
		collapsed: 'not expanded',
		disabled: 'disabled',
	},
	// unverified against our markup
	NVDA: {
		combobox: 'combo box',
		listbox: 'list box',
		option: '',
		selected: 'selected',
		notSelected: 'not selected',
		expanded: 'expanded',
		collapsed: 'collapsed',
		disabled: 'unavailable',
	},
	// unverified against our markup
	VoiceOver: {
		combobox: 'combo box',
		listbox: 'list box',
		option: '',
		selected: 'selected',
		notSelected: 'not selected',
		expanded: 'expanded',
		collapsed: 'collapsed',
		disabled: 'dimmed',
	},
};

const say = WORDS[sr.name] ?? WORDS.virtual;

// One scenario per test: two live selects mint the same listbox ids, so every IDREF after the first resolves to the wrong one.
async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
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

// Wait for the reader to catch up with a moved focus, then assert the announcement that catching up produced.
async function expectAnnouncesAfterChange(facts: readonly string[]) {
	expectConveys(await sr.settleOnFocus(), facts);
}

test('entering the select conveys the combobox role and the select name', async () => {
	await open(Basic);
	expectConveys(await readFor([say.combobox]), [say.combobox, 'Favorite Fruit']);
});

test('a select that is not showing its popup conveys that it is collapsed', async () => {
	await open(Basic);
	expectConveys(await readFor([say.combobox]), [say.combobox, say.collapsed]);
});

test('a select showing its popup conveys expanded and a named listbox', async () => {
	await open(OpenList);
	expectConveys(await readFor([say.combobox]), [say.combobox, say.expanded]);
	expectConveys(await readFor([say.listbox]), [say.listbox, 'Favorite Fruit']);
});

test('the chosen option is the only one conveyed as selected', async () => {
	await open(OpenList);
	expectConveys(await readFor(['Apple']), ['Apple', say.notSelected]);
	expectConveys(await readFor(['Banana']), ['Banana', say.selected]);
	expectConveys(await readFor(['Cherry']), ['Cherry', say.notSelected]);
});

// One walk, not thirteen: this lane runs files in parallel and a suite that re-walks the tree per name starves the other families' polls.
test("all thirteen options are reached in order, aria-at's reference count", async () => {
	await open(LongOpenList);
	const names = [
		'Apple',
		'Apricot',
		'Banana',
		'Blackberry',
		'Blueberry',
		'Cherry',
		'Cranberry',
		'Date',
		'Fig',
		'Grape',
		'Lemon',
		'Mango',
		'Peach',
	];
	const reached: string[] = [];
	for (let step = 0; step < 80; step++) {
		const spoken = sr.segments(await sr.lastSpokenPhrase());
		for (const name of names) {
			if (spoken.includes(name) && !reached.includes(name)) reached.push(name);
		}
		if (reached.length === names.length) break;
		await sr.next();
	}
	expect(reached).toEqual(names);
});

// Moving the highlight is not choosing: a "selected" here means the arrow handler committed. Banana to Cherry on purpose - Banana is the option this select arrived on.
test('arrowing off the chosen option announces the next one as not selected', async () => {
	await open(OpenList);
	await readFor(['Banana', say.selected]);
	const cherry = document.querySelector('[data-testid="cherry"]');
	expect(cherry, 'the scenario names its third option').not.toBeNull();

	await sr.press(sr.keys.arrowDown);
	// Wait for the gesture's own outcome - the roving focus landing - before asking the reader anything.
	await expect.poll(() => document.activeElement).toBe(cherry);

	// Not a re-read: `reannounce()` round-trips through a list's "end of" boundary, which is a fixpoint the cursor never leaves under lane load.
	const announced = await sr.settleOnFocus();
	expectConveys(announced, ['Cherry', say.notSelected]);
	// "selected" must be missing outright, not merely contained in "not selected".
	expect(missing(announced, [say.selected]), `${sr.name} announced "${announced}"`).toEqual([
		say.selected,
	]);
});

// Escape must also leave the value untouched, but that is behind a hidden listbox this reader cannot walk into, so select.browser.ts carries it.
test('Escape leaves the select conveying collapsed', async () => {
	await open(Prefilled);
	await readFor([say.combobox]);
	const trigger = document.querySelector('[role="combobox"]') as HTMLElement;
	await sr.press(sr.keys.arrowDown);
	await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('true');

	await sr.press('Escape');
	await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('false');
	await expectAnnouncesAfterChange([say.combobox, say.collapsed]);
});

test('an option nobody may choose conveys that it is disabled', async () => {
	await open(UnavailableOptions);
	expectConveys(await readFor(['Banana']), ['Banana', say.disabled]);
});

// The trigger is a native disabled button, so the reader conveys it on the combobox itself.
test('a select nobody may touch conveys disabled on the combobox', async () => {
	await open(UnavailableOptions);
	expectConveys(await readFor([say.combobox, 'Support Plan']), [
		say.combobox,
		'Support Plan',
		say.disabled,
	]);
});

// A bare `<select>` carries the combobox role natively, so failing to hide it puts the same choice in the tree twice - proven here by counting.
test('the hidden native control is never announced beside the real combobox', async () => {
	await open(SignupForm);
	const log: string[] = [];
	for (let step = 0; step < 60; step++) {
		log.push(await sr.lastSpokenPhrase());
		await sr.next();
	}
	const spoken = log.filter((phrase) => sr.segments(phrase)[0] === say.combobox);
	expect(spoken.length).toBeGreaterThan(0);
	expect(new Set(spoken).size).toBe(1);
});
