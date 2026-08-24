import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import { Basic } from './scenarios/basic.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { UnavailableOptions } from './scenarios/unavailable-options.tsrx';

// What a screen reader says about the radio-group family, asserted the way the
// w3c/aria-at `tests/apg/radiogroup-roving-tabindex` plan asserts it: each step
// names the facts the announcement has to convey - role, accessible name, state
// - and never a product's wording. The sequence letters below are those the plan uses.
// `sr` is the only line that picks a reader, so the same expectations
// run against NVDA and VoiceOver once those drivers land.
//
// aria-at's reference group takes its name from a `fieldset`/`legend`, which is
// exactly what `radiogroup.root` and `radiogroup.label` render, so the group rows
// below are the plan's own shape rather than an adaptation of it.
//
// aria-at coverage, recorded honestly: the plan has no test for a disabled option
// or a whole disabled group, and none for description/error text reaching the
// reader. The research note says so, and the rows that cover those below are ours
// rather than the plan's.
const sr = virtualDriver;

// One scenario per test: the field ids are minted per container, so two scenarios
// alive in one document give two inputs the same id and every `.
<label for>` after
// the first resolves to the wrong field.
async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// A choice reaches the DOM after the dispatch it woke returns, so the reader is
// asked again until the new state is what it reads.
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect.poll(async () => missingFacts(sr, await sr.reannounce(), conveys)).toEqual([]);
}

// Sequence A, entering the group: aria-at asserts the group's name at priority 1
// and its role at priority 2, before any option's own facts.
test('entering the group conveys the radiogroup role and the group name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'radiogroup' }), {
		role: 'radiogroup',
		name: 'Billing Period',
	});
});

// Sequence A, the option step: nothing is chosen, so every option is conveyed as
// not checked. aria-at marks the unchecked state priority 3 here and priority 1
// in Sequence B, which is why both directions have a row.
test('each option conveys the radio role, its own name and that it is not checked', async () => {
	await open(Basic);
	for (const name of ['Monthly', 'Annual', 'Lifetime']) {
		expectConveys(await readUntil(sr, { role: 'radio', name }), {
			role: 'radio',
			name,
			state: ['notChecked'],
		});
	}
});

// Sequence B: a group that arrives with a choice already made conveys that choice
// as checked - priority 1 - and leaves the other two not checked.
test('a group that starts with a choice conveys exactly that option as checked', async () => {
	await open(Prefilled);
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Monthly' }), {
		role: 'radio',
		name: 'Monthly',
		state: ['notChecked'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Annual' }), {
		role: 'radio',
		name: 'Annual',
		state: ['checked'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Lifetime' }), {
		role: 'radio',
		name: 'Lifetime',
		state: ['notChecked'],
	});
});

// Sequence D, the half this reader can prove: an arrow moves focus onto the next
// option. Whether it also CHOSE that option is the row below, which this lane
// cannot read - see the comment there.
test('arrowing to the next option moves the reader onto that option', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'radio', name: 'Monthly' });
	await sr.press(sr.keys.arrowDown);
	await expect
		.poll(async () => missingFacts(sr, await sr.reannounce(), { role: 'radio', name: 'Annual' }))
		.toEqual([]);
});

// Recorded red against the LANE, not against the family, and measured on this
// branch. Sequence D is the row that catches the most common way this pattern is
// got wrong - an arrow has to move focus AND choose, and aria-at asserts the
// checked state at priority 1 on that one keypress - but this reader cannot see
// the answer.
//
// After the arrow, `input.checked` is `true` on the option the arrow landed on,
// its indicator part reads "Chosen", and the option it came from is `false`; the
// `checked` content attribute is `null`, because the platform makes that attribute
// the DEFAULT state and the property the CURRENT one, and the family sets the
// property. @guidepup/virtual-screen-reader reads the attribute, so it announces
// "not checked" about a radio the browser considers checked. `radio-group.browser.ts`
// proves the choice lands; the row above proves the move lands.
//
// NVDA and VoiceOver read the platform accessibility tree, which is built from the
// property, so this is precisely the assertion the `.nvda.ts` and `.voiceover.ts`
// lanes exist to carry. It turns red the day the virtual reader reads the property,
// and whoever sees that deletes the `.fails`.
test.fails('arrowing to the next option announces that option as checked', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'radio', name: 'Monthly' });
	await sr.press(sr.keys.arrowDown);
	await expectAnnouncesAfterChange({
		role: 'radio',
		name: 'Annual',
		state: ['checked'],
	});
});

// Ours, not aria-at's: the plan has no disabled-option.
 test. An option nobody may
// choose has to say so, and the group it sits in stays usable.
test('an option nobody may choose conveys that it is disabled', async () => {
	await open(UnavailableOptions);
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Lifetime' }), {
		role: 'radio',
		name: 'Lifetime',
		state: ['notChecked', 'disabled'],
	});
});

// Ours, not aria-at's: a whole disabled group. `disabled` on the `fieldset`
// disables every option natively, so the reader has to convey it on the group and
// on each option inside it.
test('a group nobody may touch conveys disabled on the group and on its options', async () => {
	await open(UnavailableOptions);
	expectConveys(await readUntil(sr, { role: 'radiogroup', name: 'Support Plan' }), {
		role: 'radiogroup',
		name: 'Support Plan',
		state: ['disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: 'Basic' }), {
		role: 'radio',
		name: 'Basic',
		state: ['checked', 'disabled'],
	});
});
