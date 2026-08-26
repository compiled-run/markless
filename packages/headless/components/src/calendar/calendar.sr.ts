import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Bounded from './scenarios/bounded.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Popup from './scenarios/popup.tsrx';

// Rows assert the facts an announcement has to convey - role, name, pressed,
// unavailable - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a day announcement has to convey.
 *
 * `pressed` has no slot in the shared `Vocabulary`, for the reason
 * `datebox.sr.ts` records for `spinbutton`: no slot exists, and a reader whose
 * word for the fact has never been observed against our markup answers with the
 * empty string, which `missing` skips rather than failing against an invented
 * phrase.
 */
type DayWords = {
	readonly button: string;
	readonly group: string;
	readonly pressed: string;
	readonly notPressed: string;
	readonly disabled: string;
};

const unobserved = '';

const WORDS: Record<string, DayWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		button: 'button',
		group: 'group',
		pressed: 'pressed',
		notPressed: 'not pressed',
		disabled: 'disabled',
	},
	// unverified against our markup: this reader's documented wording, never seen
	// against these 42 buttons, so every fact it cannot source is skipped.
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

// August 2026 is the month every scenario is fixed to, so a row can name a date
// and know it is on the page.
const AUGUST = new Intl.DateTimeFormat(undefined, {
	weekday: 'long',
	year: 'numeric',
	month: 'long',
	day: 'numeric',
});

function dayName(day: number): string {
	return AUGUST.format(new Date(2026, 7, day));
}

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await expect.poll(() => document.querySelectorAll('[data-testid="day"]').length).toBe(42);
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

// Only for what sits near the top of the month. A walk to a particular day is not
// used: this reader speaks three phrases per button, so the far end of the grid is
// hundreds of steps away, and focusing the day reads the same announcement at once.
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

function dayEl(iso: string): HTMLButtonElement {
	const found = document.querySelector(`[data-testid="day"][value="${iso}"]`);
	if (!found) throw new Error(`No day on the page for ${iso}.`);
	return found as HTMLButtonElement;
}

// What the reader says about one day, read where a person meets it: on focus.
async function readDay(iso: string): Promise<string> {
	dayEl(iso).focus();
	return sr.settleOnFocus();
}

/**
 * A day's name carries commas of its own - "Tuesday, August 25, 2026" - and the
 * driver splits an announcement into facts on commas, so the name is asserted
 * against the whole phrase and the state words against the segments. Segments for
 * the states is what keeps "pressed" from matching inside "not pressed".
 */
function expectDayConveys(phrase: string, name: string, states: readonly string[]) {
	expect(phrase, `${sr.name} announced "${phrase}"`).toContain(name);
	expectConveys(phrase, states);
}

const dayEls = () => [...document.querySelectorAll('[data-testid="day"]')];
const tabStops = () =>
	dayEls()
		.filter((one) => one.getAttribute('tabindex') === '0')
		.map((one) => one.getAttribute('value'));

test('the month is one group carrying the month and year as its name', async () => {
	await open(Basic);
	expectConveys(await readFor([say.group, 'August 2026']), [say.group, 'August 2026']);
});

test('the title is announced when the month moves under it', async () => {
	await open(Basic);
	const title = document.querySelector('[data-testid="title"]') as HTMLElement;
	// A polite live region is what carries the new month to a reader whose focus
	// has not moved; the row pins that mechanism, not one reader's wording.
	expect(title.getAttribute('aria-live')).toBe('polite');
	expect(title.textContent).toBe('August 2026');

	(document.querySelector('[data-testid="forward"]') as HTMLButtonElement).click();
	await expect.poll(() => title.textContent).toBe('September 2026');
});

test('a day is a button named by its whole date', async () => {
	await open(Basic);
	expectDayConveys(await readDay('2026-08-25'), dayName(25), [say.button]);
});

test('the chosen day conveys that it is pressed and the others that they are not', async () => {
	await open(Controlled);
	expectDayConveys(await readDay('2026-08-14'), dayName(14), [say.button, say.pressed]);
	expectDayConveys(await readDay('2026-08-15'), dayName(15), [say.button, say.notPressed]);
});

test('choosing a day moves what is conveyed as pressed', async () => {
	await open(Controlled);
	dayEl('2026-08-20').click();
	await expect.poll(() => dayEl('2026-08-20').getAttribute('aria-pressed')).toBe('true');
	expect(dayEl('2026-08-14').getAttribute('aria-pressed')).toBe('false');

	expectDayConveys(await readDay('2026-08-20'), dayName(20), [say.button, say.pressed]);
});

test('a day outside the bounds conveys that it is unavailable and stays reachable', async () => {
	await open(Bounded);
	// 2026-08-04 is before `min` and 2026-08-12 is named in `unavailable`: both are
	// announced as unavailable, and neither leaves the tab order.
	expectDayConveys(await readDay('2026-08-04'), dayName(4), [say.button, say.disabled]);
	expect(dayEl('2026-08-04').hasAttribute('disabled')).toBe(false);
	expect(dayEl('2026-08-12').getAttribute('aria-disabled')).toBe('true');
	expect(dayEl('2026-08-12').hasAttribute('disabled')).toBe(false);
});

test('the month is one tab stop, so Tab passes it rather than walking 42 days', async () => {
	await open(Basic);
	expect(tabStops().length).toBe(1);
	expect(dayEls().filter((one) => one.getAttribute('tabindex') === '-1').length).toBe(41);
});

test('the tab stop follows the day the keyboard walks onto, across a month crossing', async () => {
	await open(Basic);
	dayEl('2026-08-31').focus();
	await expect.poll(() => tabStops()).toEqual(['2026-08-31']);

	await sr.press('ArrowRight');
	await expect
		.poll(() => (document.querySelector('[data-testid="title"]') as HTMLElement).textContent)
		.toBe('September 2026');
	await expect
		.poll(() => (document.activeElement as HTMLElement | null)?.getAttribute('value'))
		.toBe('2026-09-01');
});

test('Escape closes a revealed month and hands the reader back to the trigger', async () => {
	await open(Popup);
	const trigger = document.querySelector('[data-testid="trigger"]') as HTMLButtonElement;
	const content = document.querySelector('[data-testid="content"]') as HTMLElement;

	trigger.click();
	await expect.poll(() => content.hasAttribute('hidden')).toBe(false);
	dayEl('2026-08-10').focus();

	await sr.press('Escape');
	await expect.poll(() => content.hasAttribute('hidden')).toBe(true);
	expect(trigger.getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => document.activeElement).toBe(trigger);
});
