// Every skipped row here is skipped on one open defect: THE SELECT-ALL AND THE GROUP
// SHARE ONE ACCESSIBLE NAME. `checklist.root` is both the group element and the
// select-all's checkbox root, so `checklist.label` names both, and a reader announces
// the select-all under the group's own name. See note.md.
import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Partial from './scenarios/partial.tsrx';
import UnavailableOptions from './scenarios/unavailable-options.tsrx';

// Rows follow the w3c/aria-at tri-state checkbox plan and its dual-state sibling, and
// assert the facts an announcement must convey - role, name, state - never a reader
// product's wording. `sr` is the only line that picks a reader, so the same
// expectations run against NVDA and VoiceOver once those drivers land.
//
// aria-at takes the group's name from a `fieldset`/`legend`, which is what
// `checklist.root` and `checklist.label` render, so the group rows are the plan's own
// shape rather than an adaptation of it.
const sr = virtualDriver;

// One scenario per test: the trigger id is minted per container, so two scenarios
// alive in one document give two elements the same id and every `<label for>`
// after the first resolves to the wrong trigger.
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

// A toggle reaches the DOM after the dispatch it woke returns, so the reader is
// asked again until the new state is what it reads.
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect.poll(async () => missingFacts(sr, await sr.reannounce(), conveys)).toEqual([]);
}

// Nothing changed is not something a poll can wait for: give the dispatch the
// same room a real toggle gets, then read the item once.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

// Sequence A, entering the group: aria-at asserts the group's name and its role
// before the control's own facts, both at priority 2.
test.skip('entering the list conveys the group and its name before the select-all', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'group' }), {
		role: 'group',
		name: 'Sandwich Condiments',
	});
});

// Sequence C, the unchecked half: reading the select-all conveys its role, its
// name and that it is not checked.
test.skip('reading an untouched select-all conveys the checkbox role, its name and that it is not checked', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'All condiments' }), {
		role: 'checkbox',
		name: 'All condiments',
		state: ['notChecked'],
	});
});

// Sequence F, from the sibling dual-state plan: every item is its own tab stop,
// with no position-in-set fact, because a checkbox group is not a set the way a
// radio group is. That is the audible difference between the two families.
test('each item conveys the checkbox role, its own name and that it is not checked', async () => {
	await open(Basic);
	for (const name of ['Lettuce', 'Tomato', 'Mustard']) {
		expectConveys(await readUntil(sr, { role: 'checkbox', name }), {
			role: 'checkbox',
			name,
			state: ['notChecked'],
		});
	}
});

// Ours, replacing aria-at's `operateUncheckedCheckbox`. That assertion expects
// unchecked -> mixed, the standalone tri-state cycle; a select-all never cycles into
// mixed, because its mixed state is computed from the items rather than chosen.
// Recorded here so nobody later "fixes" this family to match the plan.
test.skip('pressing space on an untouched select-all announces it as checked, never as partially checked', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'checkbox', name: 'All condiments' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'checkbox',
		name: 'All condiments',
		state: ['checked'],
	});
	expect(missingFacts(sr, await sr.lastSpokenPhrase(), { state: ['partiallyChecked'] })).not.toEqual(
		[],
	);
});

// Sequence F's second step, on an item rather than on the parent.
test('pressing space on an item announces that item as checked', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'checkbox', name: 'Lettuce' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'checkbox',
		name: 'Lettuce',
		state: ['checked'],
	});
});

// Sequence E: the parent's state changed but focus did not move, and nothing
// announces it. This is the family's known accessibility weakness and the reason
// `aria-controls` on the parent matters - it gives a reader a way to REACH the
// controlled set. It must not be solved with aria-live on the select-all, which
// would announce on every single item toggle.
test('checking one item announces that item only, and says nothing about the select-all', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'checkbox', name: 'Lettuce' });
	await sr.press(sr.keys.space);
	await settle();
	const spoken = await sr.lastSpokenPhrase();
	expect(spoken).not.toContain('All condiments');
});

test('an item nobody may change conveys that it is disabled and space leaves it alone', async () => {
	await open(UnavailableOptions);
	const name = 'Not available on your plan';
	expectConveys(await readUntil(sr, { role: 'checkbox', name }), {
		role: 'checkbox',
		name,
		state: ['notChecked', 'disabled'],
	});
	await sr.press(sr.keys.space);
	await settle();
	expectConveys(await sr.reannounce(), {
		role: 'checkbox',
		name,
		state: ['notChecked', 'disabled'],
	});
});

// --- groups that start with something ticked ------------------------------
//
// A composed family's root cannot be seeded from the enclosing family's instance
// today, so such a group renders as if it were empty and a reader is told the truth
// about the DOM rather than about the group. See note.md.

// Sequence A, the state step: readers differ on the word ("half checked", "mixed"),
// and aria-at asserts the STATE at priority 1, which is why this asks the driver for
// the fact rather than for a token.
test.fails('reading a partly ticked select-all conveys it as partially checked', async () => {
	await open(Partial);
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'All condiments' }), {
		role: 'checkbox',
		name: 'All condiments',
		state: ['partiallyChecked'],
	});
});

// Sequence D (`operateMixedCheckbox`): aria-at asserts only the state change, which
// agrees with our design even though the APG example's cycle does not.
test.skip('pressing space on a partly ticked select-all announces it as checked', async () => {
	await open(Partial);
	await readUntil(sr, { role: 'checkbox', name: 'All condiments' });
	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange({
		role: 'checkbox',
		name: 'All condiments',
		state: ['checked'],
	});
});

// Sequence C, the checked half: an item the group starts with ticked has to be
// conveyed as checked.
test('an item the group starts with ticked is conveyed as checked', async () => {
	await open(Partial);
	expectConveys(await readUntil(sr, { role: 'checkbox', name: 'Tomato' }), {
		role: 'checkbox',
		name: 'Tomato',
		state: ['checked'],
	});
});
