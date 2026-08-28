import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import DisabledItems from './scenarios/disabled-items.tsrx';
import Multiple from './scenarios/multiple.tsrx';

// Rows assert the facts an announcement has to convey - role, name, pressed,
// disabled - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a toggle button announcement has to convey.
 *
 * `pressed` has no slot in the shared `Vocabulary`, for the reason
 * `calendar.sr.ts` records: no slot exists, and a reader whose word for the fact
 * has never been observed against our markup answers with the empty string,
 * which `missing` skips rather than failing against an invented phrase.
 */
type ItemWords = {
	readonly button: string;
	readonly group: string;
	readonly pressed: string;
	readonly notPressed: string;
	readonly disabled: string;
};

const unobserved = '';

const WORDS: Record<string, ItemWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		button: 'button',
		group: 'group',
		pressed: 'pressed',
		notPressed: 'not pressed',
		disabled: 'disabled',
	},
	// unverified against our markup: this reader's documented wording, never seen
	// against these buttons, so every fact it cannot source is skipped.
	NVDA: {
		button: 'button',
		group: 'grouping',
		pressed: unobserved,
		notPressed: unobserved,
		disabled: 'unavailable',
	},
	// unverified against our markup; same reason as above
	VoiceOver: {
		button: 'button',
		group: 'group',
		pressed: unobserved,
		notPressed: unobserved,
		disabled: 'dimmed',
	},
};

const say = WORDS[sr.name] ?? WORDS.virtual;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

// An empty phrase is a reader with no word for the fact, not a fact it omitted.
function missing(phrase: string, facts: readonly string[]): string[] {
	const spoken = sr.segments(phrase);
	return facts.filter((fact) => fact !== '' && !spoken.includes(fact));
}

function expectConveys(phrase: string, facts: readonly string[]) {
	expect(missing(phrase, facts), `${sr.name} announced "${phrase}"`).toEqual([]);
}

async function readFor(facts: readonly string[], limit = 30): Promise<string> {
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

function itemEl(testid: string): HTMLButtonElement {
	const found = document.querySelector(`[data-testid="${testid}"]`);
	if (!found) throw new Error(`No item on the page for ${testid}.`);
	return found as HTMLButtonElement;
}

// What the reader says about one item, read where a person meets it: on focus.
async function readItem(testid: string): Promise<string> {
	itemEl(testid).focus();
	return sr.settleOnFocus();
}

test('entering the group conveys the group and the name its label gives it', async () => {
	await open(Basic);
	expectConveys(await readFor([say.group, 'Text alignment']), [say.group, 'Text alignment']);
});

test('each item conveys the button role, its own name and whether it is pressed', async () => {
	await open(Basic);
	expectConveys(await readItem('left'), ['Left', say.button, say.pressed]);
	expectConveys(await readItem('center'), ['Center', say.button, say.notPressed]);
	expectConveys(await readItem('right'), ['Right', say.button, say.notPressed]);
});

test('pressing an item moves what is conveyed as pressed', async () => {
	await open(Basic);
	itemEl('center').click();
	await expect.poll(() => itemEl('center').getAttribute('aria-pressed')).toBe('true');
	expect(itemEl('left').getAttribute('aria-pressed')).toBe('false');

	expectConveys(await readItem('center'), ['Center', say.button, say.pressed]);
	expectConveys(await readItem('left'), ['Left', say.button, say.notPressed]);
});

test('pressing the pressed item conveys that it is no longer pressed', async () => {
	await open(Basic);
	itemEl('left').click();
	await expect.poll(() => itemEl('left').getAttribute('aria-pressed')).toBe('false');

	expectConveys(await readItem('left'), ['Left', say.button, say.notPressed]);
});

// A multi-select group announces itself item by item, exactly as a single-select
// one does: the difference is how many of them say pressed, not what they say.
test('a multi-select group conveys every pressed item as pressed', async () => {
	await open(Multiple);
	expectConveys(await readItem('bold'), ['Bold', say.button, say.pressed]);
	expectConveys(await readItem('italic'), ['Italic', say.button, say.notPressed]);
	expectConveys(await readItem('underline'), ['Underline', say.button, say.pressed]);
});

test('an item nobody may press conveys that it is disabled', async () => {
	await open(DisabledItems);
	expectConveys(await readFor(['Justify', say.button, say.disabled]), [
		'Justify',
		say.button,
		say.disabled,
	]);
});

// The group's `disabled` reaches the group's own aria and every item inside it.
test('a group nobody may touch conveys disabled on the group and on its items', async () => {
	await open(DisabledItems);
	expectConveys(await readFor([say.group, 'Text style', say.disabled]), [
		say.group,
		'Text style',
		say.disabled,
	]);
	expectConveys(await readFor(['Bold', say.button, say.disabled]), [
		'Bold',
		say.button,
		say.disabled,
	]);
});
