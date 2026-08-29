import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Multiple from './scenarios/multiple.tsrx';
import Prepicked from './scenarios/prepicked.tsrx';
import Selectable from './scenarios/selectable.tsrx';
import WithWidgets from './scenarios/with-widgets.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a grid announcement has to convey.
 *
 * None of these are slots in the shared `Vocabulary`: no family before this one
 * has shipped `grid`, `row` or `gridcell`, and the words a reader uses for them
 * have never been observed against our markup. A reader whose wording for a
 * fact has never been heard answers with the empty string, which `missing` below
 * skips rather than failing against a word nobody has said.
 */
type GridWords = {
	readonly grid: string;
	readonly row: string;
	readonly selected: string;
	readonly notSelected: string;
	readonly disabled: string;
	readonly button: string;
};

const unheard = '';

const WORDS: Record<string, GridWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		grid: 'grid',
		row: 'row',
		selected: 'selected',
		notSelected: 'not selected',
		disabled: 'disabled',
		button: 'button',
	},
	// unverified against our markup
	NVDA: {
		grid: 'grid',
		row: 'row',
		selected: 'selected',
		notSelected: unheard,
		disabled: 'unavailable',
		button: 'button',
	},
	// unverified against our markup
	VoiceOver: {
		grid: 'grid',
		row: 'row',
		selected: 'selected',
		notSelected: unheard,
		disabled: 'dimmed',
		button: 'button',
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

// Walk forward until an announcement conveys everything asked for; a walk that never arrives is the same defect as a wrong phrase.
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

// A move reaches the DOM after the dispatch the keystroke woke returns, so the reader is asked again until the new state is what it reads.
async function expectAnnouncesAfterChange(facts: readonly string[]) {
	await expect.poll(async () => missing(await sr.reannounce(), facts)).toEqual([]);
}

function focusRow(testid: string) {
	const row = document.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
	row.focus();
	return row;
}

test('the rows are announced inside a grid that carries the name', async () => {
	await open(Basic);
	expectConveys(await readFor([say.grid, 'Files']), [say.grid, 'Files']);
});

test('each row conveys the row role and its own words', async () => {
	await open(Basic);
	expectConveys(await readFor([say.row, 'README.md']), [say.row, 'README.md']);
	expectConveys(await readFor([say.row, 'LICENSE']), [say.row, 'LICENSE']);
});

/**
 * The row is what carries the picked state, which is the whole reason the mark
 * a consumer paints beside it is `aria-hidden`: two announcements of one fact
 * is what a reader would otherwise get.
 */
test('a row of a selectable list conveys whether it is picked', async () => {
	await open(Prepicked);
	expectConveys(await readFor([say.row, 'README.md']), [say.selected]);
	expectConveys(await readFor([say.row, 'LICENSE']), [say.notSelected]);
});

test('a list nobody can pick from says nothing about picking', async () => {
	await open(Basic);
	const phrase = await readFor([say.row, 'README.md']);
	expect(phrase, `${sr.name} announced "${phrase}"`).not.toContain(say.selected);
});

test('picking a row with the space bar conveys the new state', async () => {
	await open(Selectable);
	const readme = focusRow('readme-item');
	await sr.settleOnFocus();

	await sr.press(sr.keys.space);
	await expect.poll(() => readme.getAttribute('aria-selected')).toBe('true');
	await expectAnnouncesAfterChange([say.selected]);
});

test('a list that takes several rows at once says so', async () => {
	await open(Multiple);
	const grid = document.querySelector('[data-testid="root"]') as HTMLElement;
	expect(grid.getAttribute('aria-multiselectable')).toBe('true');
	expectConveys(await readFor([say.grid, 'Files']), [say.grid, 'Files']);
});

test('a control a row holds is reachable and conveys that it is a button', async () => {
	await open(WithWidgets);
	expectConveys(await readFor([say.button, 'Rename']), [say.button, 'Rename']);
});

// The LICENSE row rather than the README one: a row's name is everything it
// reads, so the row holding a Rename button is announced as "README.md Rename".
test('a list nobody may use conveys that its rows are unavailable', async () => {
	await open(Disabled);
	expectConveys(await readFor([say.row, 'LICENSE']), [say.row, say.disabled]);
});
