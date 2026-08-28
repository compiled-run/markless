import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Mixed from './scenarios/mixed.tsrx';

// Rows assert the facts an announcement has to convey - the bar's role and name,
// and then each control's own role and name - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a toolbar announcement has to convey.
 *
 * `toolbar` has no slot in the shared `Vocabulary`, for the reason
 * `buttongroup.sr.ts` records for `pressed`: no slot exists, and a reader whose
 * word for the fact has never been observed against our markup answers with the
 * empty string, which `missing` skips rather than failing against an invented
 * phrase.
 */
type BarWords = {
	readonly toolbar: string;
	readonly button: string;
	readonly switch: string;
	readonly pressed: string;
};

const unobserved = '';

const WORDS: Record<string, BarWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		toolbar: 'toolbar',
		button: 'button',
		switch: 'switch',
		pressed: 'pressed',
	},
	// unverified against our markup: this reader's documented wording, never seen
	// against these controls, so every fact it cannot source is skipped.
	NVDA: {
		toolbar: 'tool bar',
		button: 'button',
		switch: 'switch',
		pressed: unobserved,
	},
	// unverified against our markup; same reason as above
	VoiceOver: {
		toolbar: 'toolbar',
		button: 'button',
		switch: 'switch',
		pressed: unobserved,
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

function controlEl(testid: string): HTMLElement {
	const found = document.querySelector(`[data-testid="${testid}"]`);
	if (!found) throw new Error(`No control on the page for ${testid}.`);
	return found as HTMLElement;
}

// What the reader says about one control, read where a person meets it: on focus.
async function readControl(testid: string): Promise<string> {
	controlEl(testid).focus();
	return sr.settleOnFocus();
}

test('entering the bar conveys a toolbar and the name its label gives it', async () => {
	await open(Basic);
	expectConveys(await readFor([say.toolbar, 'Text formatting']), [
		say.toolbar,
		'Text formatting',
	]);
});

test('each control in a bar of buttons conveys the button role and its own name', async () => {
	await open(Basic);
	expectConveys(await readControl('copy'), ['Copy', say.button]);
	expectConveys(await readControl('cut'), ['Cut', say.button]);
	expectConveys(await readControl('paste'), ['Paste', say.button]);
});

// The difference between this family and every other composite: the bar does not
// change what its children are. Each control announces its own role.
test('a mixed bar leaves every control announcing its own role', async () => {
	await open(Mixed);
	expectConveys(await readControl('left'), ['Left', say.button, say.pressed]);
	expectConveys(await readControl('wrap'), ['Wrap lines', say.switch]);
	expectConveys(await readControl('print'), ['Print', say.button]);
});

test('moving the bar stop announces the control it lands on', async () => {
	await open(Mixed);
	await readControl('left');

	// Dispatched on the control the key was pressed on, which is what the bar reads
	// to know where the walk starts.
	controlEl('left').dispatchEvent(
		new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
	);
	await expect.poll(() => document.activeElement).toBe(controlEl('center'));
	expectConveys(await sr.settleOnFocus(), ['Center', say.button]);
});
