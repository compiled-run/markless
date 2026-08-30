import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Cells from './scenarios/cells.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Multiple from './scenarios/multiple.tsrx';
import PickedCells from './scenarios/picked-cells.tsrx';
import Prepicked from './scenarios/prepicked.tsrx';
import Sortable from './scenarios/sortable.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

/**
 * What one reader calls the facts a table announcement has to convey.
 *
 * None of these are slots in the shared `Vocabulary`: `table`, `grid`, `row`,
 * `gridcell`, `columnheader` and `rowheader` have been shipped by no family but
 * this one and its sibling, and the words a reader uses for them have never been
 * observed against our markup. A reader whose wording for a fact has never been
 * heard answers with the empty string, which `missing` below skips rather than
 * failing against a word nobody has said.
 */
type TableWords = {
	readonly table: string;
	readonly grid: string;
	readonly row: string;
	readonly columnheader: string;
	readonly rowheader: string;
	readonly selected: string;
	readonly notSelected: string;
	readonly disabled: string;
};

const unheard = '';

const WORDS: Record<string, TableWords> = {
	// measured: this reader's own output for our markup
	virtual: {
		table: 'table',
		grid: 'grid',
		row: 'row',
		columnheader: 'columnheader',
		rowheader: 'rowheader',
		selected: 'selected',
		notSelected: 'not selected',
		disabled: 'disabled',
	},
	// unverified against our markup
	NVDA: {
		table: 'table',
		grid: 'grid',
		row: 'row',
		columnheader: 'column header',
		rowheader: 'row header',
		selected: 'selected',
		notSelected: unheard,
		disabled: 'unavailable',
	},
	// unverified against our markup
	VoiceOver: {
		table: 'table',
		grid: 'grid',
		row: 'row',
		columnheader: 'column header',
		rowheader: 'row header',
		selected: 'selected',
		notSelected: unheard,
		disabled: 'dimmed',
	},
};

const say = WORDS[sr.name] ?? WORDS.virtual;

// A row is named from its contents, so the name an announcement carries is every
// cell's text in document order - never the one cell the row is recognised by.
const ROW_README = 'README.md 4.1 kB';
const ROW_LICENSE = 'LICENSE 1.1 kB';

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

function focusPart(testid: string) {
	const part = document.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
	part.focus();
	return part;
}

/**
 * The whole progressive claim, heard rather than read: a table nobody has
 * configured is announced as a table, because the family wrote no role over what
 * the elements already mean.
 */
test('a bare table is announced as a table, named by its caption', async () => {
	await open(Basic);
	expectConveys(await readFor([say.table, 'Files']), [say.table, 'Files']);
});

// The row role here is the elements' own: the family writes none on a bare table,
// and a `<tr>` already maps to `row`.
test('each row conveys the row role and its own words', async () => {
	await open(Basic);
	expectConveys(await readFor([say.row, ROW_README]), [say.row, ROW_README]);
	expectConveys(await readFor([say.row, ROW_LICENSE]), [say.row, ROW_LICENSE]);
});

test('a sortable header is announced as a column header', async () => {
	await open(Sortable);
	expectConveys(await readFor([say.columnheader, 'Size']), [say.columnheader, 'Size']);
});

// Cells alone earn no role, so a reader hears exactly what the elements already
// mean: a table, and the body-row `<th>` that names each row as its row header.
// The grid word arrives with the selection props, not with the cells.
test('a table of cells is announced as a table, and its row headers as row headers', async () => {
	await open(Cells);
	expectConveys(await readFor([say.table]), [say.table]);
	expectConveys(await readFor([say.rowheader, 'README.md']), [say.rowheader, 'README.md']);
});

// The other half of the progressive claim, heard: the selection props are what
// make the family own focus management, and only then is a grid announced.
test('a selectable table of cells is announced as a grid', async () => {
	await open(PickedCells);
	expectConveys(await readFor([say.grid]), [say.grid]);
});

test('a row of a selectable table conveys whether it is picked', async () => {
	await open(Prepicked);
	expectConveys(await readFor([say.row, ROW_README]), [say.selected]);
	expectConveys(await readFor([say.row, ROW_LICENSE]), [say.notSelected]);
});

test('a table nobody can pick from says nothing about picking', async () => {
	await open(Basic);
	const phrase = await readFor([say.row, ROW_README]);
	expect(phrase, `${sr.name} announced "${phrase}"`).not.toContain(say.selected);
});

test('picking a row with the space bar conveys the new state', async () => {
	await open(Multiple);
	const readme = focusPart('readme-item');
	await sr.settleOnFocus();

	await sr.press(sr.keys.space);
	await expect.poll(() => readme.getAttribute('aria-selected')).toBe('true');
	await expectAnnouncesAfterChange([say.selected]);
});

test('a table that takes several rows at once says so', async () => {
	await open(Multiple);
	const grid = document.querySelector('[data-testid="root"]') as HTMLElement;
	expect(grid.getAttribute('aria-multiselectable')).toBe('true');
});

test('a table nobody may use conveys that its rows are unavailable', async () => {
	await open(Disabled);
	expectConveys(await readFor([say.row, ROW_LICENSE]), [say.row, say.disabled]);
});
