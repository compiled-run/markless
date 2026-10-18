import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function errors(compiled: Awaited<ReturnType<typeof compile>>) {
	return [...compiled.semanticGraph.diagnostics, ...compiled.stateLowering.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
}

const moduleConstStateRow = `
import { state } from '@markless/core';

const WEEKDAYS = ['mon', 'tue'];

export function DayList() @{
	const s = state({ picked: 'mon' });
	<div>
		@for (const day of WEEKDAYS; key day) {
			<span data-picked={s.picked}>{day}</span>
		}
	</div>
}
`;

test('a module-const collection whose row reads a state cell is lifted onto the graph', async () => {
	const compiled = await compile('src/frozen-state.tsrx', moduleConstStateRow);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats[0]?.collectionGraphNodeId).toMatch(/^computed:/);
});

test('a module-const collection whose row reads a shared-instance computed is lifted', async () => {
	const compiled = await compile(
		'src/frozen-shared.tsrx',
		`
import { shared, state, computed } from '@markless/core';

const WEEKDAYS = ['mon', 'tue'];

export const calendarState = shared(() => {
	const s = state({ picked: ['a'] as readonly string[] });
	const label = computed(() => s.picked.join(', '));
	return { ...s, label };
}, { scope: 'widget' });

export function DayList() @{
	const cal = calendarState();
	<div>
		@for (const day of WEEKDAYS; key day) {
			<span>{day} {cal.label}</span>
		}
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats[0]?.collectionGraphNodeId).toMatch(/^computed:/);
});

test('an imported collection whose row reads a prop is lifted', async () => {
	const compiled = await compile(
		'src/frozen-prop.tsrx',
		`
import { WEEKDAYS } from './weekdays.ts';

export function DayList({ locale }: { locale: string }) @{
	<div>
		@for (const day of WEEKDAYS; key day) {
			<span lang={locale}>{day}</span>
		}
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats[0]?.collectionGraphNodeId).toMatch(/^computed:/);
});

test('a reactive read recombined with the row item is lifted too', async () => {
	const compiled = await compile(
		'src/frozen-composite.tsrx',
		`
import { state } from '@markless/core';

const WEEKDAYS = ['mon', 'tue'];

export function DayList() @{
	const s = state({ picked: 'mon' });
	<div>
		@for (const day of WEEKDAYS; key day) {
			<span>{day === s.picked ? 'yes' : 'no'}</span>
		}
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats[0]?.collectionGraphNodeId).toMatch(/^computed:/);
});

test('a module-const collection with static rows still compiles', async () => {
	const compiled = await compile(
		'src/static-rows.tsrx',
		`
import { state } from '@markless/core';

const WEEKDAYS = [
	{ id: 'mon', label: 'Monday' },
	{ id: 'tue', label: 'Tuesday' },
];

export function DayList() @{
	const s = state({ picked: 'mon' });
	<div>
		<p>{s.picked}</p>
		@for (const day of WEEKDAYS; key day.id) {
			<span data-day={day.id} title={day.label}>{day.label}</span>
		}
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats).toHaveLength(1);
});

test('a module-const collection whose row only reads the item still compiles', async () => {
	const compiled = await compile(
		'src/item-only.tsrx',
		`
const WEEKDAYS = ['mon', 'tue'];

export function DayList() @{
	<div>
		@for (const day of WEEKDAYS; index i; key day) {
			<span data-index={i}>{day}</span>
		}
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats).toHaveLength(1);
});

test('a state-backed collection with reactive rows still compiles', async () => {
	const compiled = await compile(
		'src/reactive-rows.tsrx',
		`
import { state } from '@markless/core';

export function DayList() @{
	const s = state({ days: ['mon', 'tue'], picked: 'mon' });
	<div>
		@for (const day of s.days; key day) {
			<span data-picked={s.picked}>{day}</span>
		}
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats).toHaveLength(1);
});

test('a handler read inside a frozen row is not a refusal', async () => {
	const compiled = await compile(
		'src/handler-read.tsrx',
		`
import { state } from '@markless/core';

const WEEKDAYS = ['mon', 'tue'];

export function DayList() @{
	const s = state({ picked: 'mon' });
	<div>
		@for (const day of WEEKDAYS; key day) {
			<button type="button" onClick={() => { s.picked = day; }}>{day}</button>
		}
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
});

test('a nested repeat over the row item does not trip the refusal', async () => {
	const compiled = await compile(
		'src/nested-static.tsrx',
		`
const GROUPS = [
	{ id: 'a', items: ['x', 'y'] },
	{ id: 'b', items: ['z'] },
];

export function List() @{
	<div>
		@for (const group of GROUPS; key group.id) {
			<ul>
				@for (const item of group.items; key item) { <li>{item}</li> }
			</ul>
		}
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats).toHaveLength(2);
});

test('a reactive read in a nested row lifts the outer module-const collection', async () => {
	const compiled = await compile(
		'src/nested-reactive.tsrx',
		`
import { state } from '@markless/core';

const GROUPS = [{ id: 'a', items: ['x'] }];

export function List() @{
	const s = state({ picked: 'x' });
	<div>
		@for (const group of GROUPS; key group.id) {
			<ul>
				@for (const item of group.items; key item) { <li data-picked={s.picked}>{item}</li> }
			</ul>
		}
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats[0]?.collectionGraphNodeId).toMatch(/^computed:/);
	expect(compiled.semanticGraph.keyedRepeats[1]?.enclosingItemPath).toEqual(['items']);
});

test('a collection built from a first-render-only body local is still refused, with the fix', async () => {
	const compiled = await compile(
		'src/frozen-let.tsrx',
		`
import { state } from '@markless/core';

export function DayList() @{
	const s = state({ picked: 'mon' });
	let days = ['mon', 'tue'];
	if (s.picked === 'sun') days = ['sun'];
	<div>
		@for (const day of days; key day) {
			<span data-picked={s.picked}>{day}</span>
		}
	</div>
}
`,
	);
	const [diagnostic, ...rest] = errors(compiled);

	expect(rest).toEqual([]);
	expect(diagnostic?.code).toBe('MARKLESS_REPEAT_ROWS_FROZEN');
	expect(diagnostic?.docsUrl).toBe('https://markless.dev/errors/MARKLESS_REPEAT_ROWS_FROZEN');
	expect(diagnostic?.title).toBe('This @for renders its rows once and never updates them');
	expect(diagnostic?.message).toContain('`days`');
	expect(diagnostic?.message).toContain('`s.picked`');
	expect(diagnostic?.message).toContain('state cell');
	expect(diagnostic?.message).toContain('only exists during the first render');
	expect(diagnostic?.suggestions[0]?.message).toContain('const days = state([...])');
	expect(diagnostic?.suggestions[0]?.message).toContain('reading only `day`');
});

test('a module-const collection nested in another row is still refused, with the fix', async () => {
	const compiled = await compile(
		'src/frozen-nested-const.tsrx',
		`
import { state } from '@markless/core';

const WEEKDAYS = ['mon', 'tue'];

export function Weeks() @{
	const s = state({ picked: 'mon', weeks: [{ id: 'w1' }] });
	<div>
		@for (const week of s.weeks; key week.id) {
			<p>
				@for (const day of WEEKDAYS; key day) {
					<span data-picked={s.picked}>{day}</span>
				}
			</p>
		}
	</div>
}
`,
	);
	const [diagnostic, ...rest] = errors(compiled);

	expect(rest).toEqual([]);
	expect(diagnostic?.code).toBe('MARKLESS_REPEAT_ROWS_FROZEN');
	expect(diagnostic?.message).toContain('from inside the row of the enclosing @for');
	expect(diagnostic?.suggestions[0]?.message).toContain('declared outside the enclosing @for');
});
