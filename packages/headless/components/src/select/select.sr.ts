import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import { Basic } from './scenarios/basic.tsrx';
import { LongOpenList } from './scenarios/long-open-list.tsrx';
import { OpenList } from './scenarios/open-list.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { SignupForm } from './scenarios/signup-form.tsrx';
import { UnavailableOptions } from './scenarios/unavailable-options.tsrx';

// What a screen reader says about the select family, asserted the way the
// w3c/aria-at `tests/apg/combobox-select-only` plan asserts it: each step names
// the facts the announcement has to convey - role, accessible name, state - and
// never a product's wording. The sequence letters below are the ones in
// goals/headless-components/notes/research-select.md, which reads them off that
// plan. `sr` is the only line that picks a reader, so the same expectations run
// against NVDA and VoiceOver once those drivers land.
//
// aria-at coverage, recorded honestly: that plan carries no test for a disabled
// option, for a whole disabled select, or for the hidden native control, so the
// rows covering those below are ours rather than the plan's. Its option-count
// assertion ("13 options") is carried here as reading every one of the thirteen
// names in order, which is the same claim a virtual reader can actually make.
const sr = virtualDriver;

// The five words this family needs that `test-support/driver.ts`'s shared
// Vocabulary does not carry yet. They live here because that file is outside
// this unit's contract; promoting them into the shared table (so `Conveys` can
// name them like every other role) is a follow-up, not a family concern.
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
	// unverified against our markup; aria-at's combobox plan says "combo box"
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

// One scenario per test: two selects alive in one document give two listboxes
// the same minted ids, and every IDREF after the first resolves to the wrong one.
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

// Move the reading cursor forward until an announcement conveys everything asked
// for, and return it. Throws with the transcript so far when it does not, because
// a walk that never arrives is the same defect as a wrong phrase.
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

// A gesture reaches the DOM after the dispatch it woke returns, so the reader is
// asked again until the new state is what it reads.
async function expectAnnouncesAfterChange(facts: readonly string[]) {
	await expect.poll(async () => missing(await sr.reannounce(), facts)).toEqual([]);
}

// Sequence A: entering the collapsed combobox. Step 3 is the row QDS fails -
// with no role="combobox" on the trigger a reader says "button" - and it is
// aria-at's `Role 'combobox' is conveyed` assertion.
test('entering the select conveys the combobox role and the select name', async () => {
	await open(Basic);
	expectConveys(await readFor([say.combobox]), [say.combobox, 'Favorite Fruit']);
});

// Sequence A, the last step: a select that is not showing its popup says so.
test('a select that is not showing its popup conveys that it is collapsed', async () => {
	await open(Basic);
	expectConveys(await readFor([say.combobox]), [say.combobox, say.collapsed]);
});

// Sequence B: the popup, once it is showing. The listbox is named by the same
// label the combobox is, which is what makes the popup findable on its own.
test('a select showing its popup conveys expanded and a named listbox', async () => {
	await open(OpenList);
	expectConveys(await readFor([say.combobox]), [say.combobox, say.expanded]);
	expectConveys(await readFor([say.listbox]), [say.listbox, 'Favorite Fruit']);
});

// Sequence B, the option step: the chosen option is conveyed as selected and the
// others are not. This is the state a select carries that a menu does not.
test('the chosen option is the only one conveyed as selected', async () => {
	await open(OpenList);
	expectConveys(await readFor(['Apple']), ['Apple', say.notSelected]);
	expectConveys(await readFor(['Banana']), ['Banana', say.selected]);
	expectConveys(await readFor(['Cherry']), ['Cherry', say.notSelected]);
});

// aria-at asserts the number of options in the popup. A virtual reader has no
// set-size announcement, so the honest form of that claim is that every one of
// the thirteen names is reached, in the order they were authored - read in one
// walk rather than thirteen, because this lane runs its files in parallel and a
// suite that re-walks the tree per name starves the other families' polls.
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

// Sequence C, and the single most valuable row in this file: moving the
// highlight is not choosing. A reader that says "selected" here means the arrow
// handler committed, which is the select family's most common bug and the exact
// mirror image of the radio-group rule. The move is Banana to Cherry on purpose:
// Banana is the option this select arrived on, so a row that arrowed onto it
// would read a "selected" the family was right to say.
test('arrowing off the chosen option announces the next one as not selected', async () => {
	await open(OpenList);
	await readFor(['Banana', say.selected]);
	await sr.press(sr.keys.arrowDown);
	await expectAnnouncesAfterChange(['Cherry', say.notSelected]);
	// The negative proof, spelled out: "selected" is a word this announcement
	// must be missing, not merely a word "not selected" happens to contain.
	expect(missing(await sr.reannounce(), [say.selected])).toEqual([say.selected]);
});

// Sequence E: Escape closes. The reader-facing half is that the select goes back
// to conveying collapsed. The other half of the sequence - that the value is the
// one it arrived with - is behind a hidden listbox this reader cannot walk into,
// so `select.browser.ts` carries it instead of this file guessing at it.
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

// Ours, not aria-at's: the plan has no disabled-option test. An option nobody
// may choose has to say so, and the select it sits in stays usable.
test('an option nobody may choose conveys that it is disabled', async () => {
	await open(UnavailableOptions);
	expectConveys(await readFor(['Banana']), ['Banana', say.disabled]);
});

// Ours, not aria-at's: a whole disabled select. The trigger is a native disabled
// button, so the reader conveys it on the combobox itself.
test('a select nobody may touch conveys disabled on the combobox', async () => {
	await open(UnavailableOptions);
	expectConveys(await readFor([say.combobox, 'Support Plan']), [
		say.combobox,
		'Support Plan',
		say.disabled,
	]);
});

// Ours, not aria-at's: the hidden native control. A bare `<select>` carries the
// combobox role natively, so a form-participating select that failed to hide it
// would put the same choice in the tree twice. `aria-hidden` plus `tabindex="-1"`
// is what makes the correct expected result silence, and this row proves it by
// counting: one combobox is announced on a page that holds two `<select>`-shaped
// controls.
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
