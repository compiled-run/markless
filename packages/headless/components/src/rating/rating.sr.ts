import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import { Basic } from './scenarios/basic.tsrx';
import { Disabled } from './scenarios/disabled.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { ReadOnly } from './scenarios/read-only.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

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

// An arrow moves a roving focus, which this reader speaks by itself a task-queue
// turn later, so the announcement is read off the focus rather than the cursor.
async function expectAnnouncesFocused(conveys: Conveys) {
	await expect.poll(async () => missingFacts(sr, await sr.settleOnFocus(), conveys)).toEqual([]);
}

/**
 * Whether anything the reader has said since the log was cleared conveys the
 * facts asked for.
 *
 * The last phrase will not do here: `rating.valuelabel` is an `<output>`,
 * which is a polite live region, so every rating change is followed by the
 * reader repeating the readout - and that phrase, not the mark's, is what
 * `lastSpokenPhrase()` answers with.
 */
async function expectSpoke(conveys: Conveys) {
	await expect
		.poll(async () => {
			const log = await sr.spokenPhraseLog();
			return log.some((phrase) => missingFacts(sr, phrase, conveys).length === 0);
		})
		.toBe(true);
}

test('entering the group conveys the radiogroup role and the group name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'radiogroup' }), {
		role: 'radiogroup',
		name: 'Overall rating',
	});
});

// The marks are named by the family, so a group nobody labelled per mark still
// gives a reader five distinct names.
test('each mark conveys the radio role, its own name and that it is not checked', async () => {
	await open(Basic);
	for (const name of ['1 of 5', '2 of 5', '3 of 5', '4 of 5', '5 of 5']) {
		expectConveys(await readUntil(sr, { role: 'radio', name }), {
			role: 'radio',
			name,
			state: ['notChecked'],
		});
	}
});

// Cumulative fill is not what a reader hears: `aria-checked` takes one member,
// and it is the mark the rating reaches.
test('a rated group conveys exactly the mark the rating reaches as checked', async () => {
	await open(Prefilled);
	expectConveys(await readUntil(sr, { role: 'radio', name: '2 of 5' }), {
		role: 'radio',
		name: '2 of 5',
		state: ['notChecked'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: '3 of 5' }), {
		role: 'radio',
		name: '3 of 5',
		state: ['checked'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: '4 of 5' }), {
		role: 'radio',
		name: '4 of 5',
		state: ['notChecked'],
	});
});

// The display-only aggregate: no driver has a word slot for `aria-readonly`, so
// what this lane can prove is that a read-only rating is still a rating a reader
// reads - role, name, and the mark the half rating stands on.
test('a read-only aggregate still conveys the group and the mark its rating reaches', async () => {
	await open(ReadOnly);
	expectConveys(await readUntil(sr, { role: 'radiogroup' }), {
		role: 'radiogroup',
		name: 'Average guest rating',
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: '5 of 5' }), {
		role: 'radio',
		name: '5 of 5',
		state: ['checked'],
	});
});

test('a group nobody may touch conveys disabled on the group and on its marks', async () => {
	await open(Disabled);
	expectConveys(await readUntil(sr, { role: 'radiogroup', name: 'Overall rating' }), {
		role: 'radiogroup',
		name: 'Overall rating',
		state: ['disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: '1 of 5' }), {
		role: 'radio',
		name: '1 of 5',
		state: ['notChecked', 'disabled'],
	});
	expectConveys(await readUntil(sr, { role: 'radio', name: '2 of 5' }), {
		role: 'radio',
		name: '2 of 5',
		state: ['checked', 'disabled'],
	});
});

// An arrow moves the rating AND focus, so the reader lands on the mark the new
// rating reaches and announces it as the checked one.
test('arrowing up the rating moves the reader onto the mark it reached and announces it checked', async () => {
	await open(Prefilled);
	// The marks are `role="radio"` divs, and this reader takes focus off a native
	// control rather than off any readable node, so the row puts focus on the mark
	// the rating is on before arrowing off it.
	const marks = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="star"]'));
	marks[2]?.focus();
	await expectAnnouncesFocused({ role: 'radio', name: '3 of 5', state: ['checked'] });

	await sr.clearSpokenPhraseLog();
	await sr.press(sr.keys.arrowRight);
	await expectSpoke({ role: 'radio', name: '4 of 5' });

	// The reader speaks the mark the moment focus lands on it, a turn before the
	// family's `aria-checked` write reaches the DOM, so the checked state is only
	// there to be heard once that write has landed - which is what is asserted
	// first, and then the reader is asked again.
	await expect.poll(() => marks[3]?.getAttribute('aria-checked')).toBe('true');
	expectConveys(await sr.reannounce(), {
		role: 'radio',
		name: '4 of 5',
		state: ['checked'],
	});
});
