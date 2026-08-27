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

function spanText(source: string, span: { readonly start: number; readonly end: number } | undefined) {
	return span ? source.slice(span.start, span.end) : '';
}

const undeclaredCollection = `
export function DayList() @{
	<div>
		@for (const day of NOPE; key day) { <span>{day}</span> }
	</div>
}
`;

test('a @for over an undeclared name is refused, naming the identifier and the site', async () => {
	const compiled = await compile('src/undeclared.tsrx', undeclaredCollection);
	const [diagnostic, ...rest] = errors(compiled);

	expect(rest).toEqual([]);
	expect(diagnostic?.code).toBe('MARKLESS_REPEAT_COLLECTION_UNREADABLE');
	expect(diagnostic?.title).toBe('This @for collection names nothing');
	expect(diagnostic?.message).toContain('`NOPE`');
	expect(diagnostic?.message).toContain('@for (const day of NOPE)');
	expect(diagnostic?.docsUrl).toBe(
		'https://markless.dev/errors/MARKLESS_REPEAT_COLLECTION_UNREADABLE',
	);
	expect(diagnostic?.primarySpan?.filename).toBe('src/undeclared.tsrx');
	expect(spanText(undeclaredCollection, diagnostic?.primarySpan)).toContain('of NOPE; key day');
});

test('the refused undeclared collection reaches no repeat and no emitted server read', async () => {
	const compiled = await compile('src/undeclared.tsrx', undeclaredCollection);

	expect(compiled.semanticGraph.keyedRepeats).toEqual([]);
	expect(compiled.publicRenderModule.ssrModuleSource).not.toContain('(NOPE)');
});

// A module constant and an import both resolve to a binding, so the refusal
// leaves them on the supported authored-collection path.
test('a @for over a module-level const still compiles', async () => {
	const compiled = await compile(
		'src/module-const.tsrx',
		`
const WEEKDAYS = ['mon', 'tue'];

export function DayList() @{
	<div>
		@for (const day of WEEKDAYS; key day) { <span>{day}</span> }
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats.map((repeat) => repeat.collectionSource)).toEqual([
		'WEEKDAYS',
	]);
});

test('a @for over an imported collection still compiles', async () => {
	const compiled = await compile(
		'src/imported.tsrx',
		`
import { WEEKDAYS } from './weekdays.ts';

export function DayList() @{
	<div>
		@for (const day of WEEKDAYS; key day) { <span>{day}</span> }
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats.map((repeat) => repeat.collectionSource)).toEqual([
		'WEEKDAYS',
	]);
});

test('a @for over an inline array literal still compiles', async () => {
	const compiled = await compile(
		'src/inline.tsrx',
		`
export function DayList() @{
	<div>
		@for (const day of ['mon', 'tue']; key day) { <span>{day}</span> }
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats).toHaveLength(1);
});

const family = `
import { shared, state, computed } from '@markless/core';

export const calendarState = shared(() => {
	const s = state({ picked: ['a', 'b'] as readonly string[] });
	const days = computed(() => s.picked.map((one) => one + '!'));
	return { ...s, days };
}, { scope: 'widget' });
`;

const definitionId = 'shared:src/cal.tsrx#calendarState';

test('the const-aliased instance computed still compiles and still resolves', async () => {
	const compiled = await compile(
		'src/cal.tsrx',
		`${family}
export function CalendarList() @{
	const cal = calendarState();
	const days = cal.days;
	<div>
		@for (const day of days; key day) { <span>{day}</span> }
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats.map((repeat) => repeat.collectionGraphNodeId)).toEqual(
		[`${definitionId}/computed:days`],
	);
});

test('the direct instance computed still compiles and still resolves', async () => {
	const compiled = await compile(
		'src/cal.tsrx',
		`${family}
export function CalendarList() @{
	const cal = calendarState();
	<div>
		@for (const day of cal.days; key day) { <span>{day}</span> }
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats.map((repeat) => repeat.collectionGraphNodeId)).toEqual(
		[`${definitionId}/computed:days`],
	);
});

test('a plain component state path still compiles and still resolves', async () => {
	const compiled = await compile(
		'src/plain.tsrx',
		`
import { state } from '@markless/core';
export function List() @{
	const s = state({ picked: ['a', 'b'] as readonly string[] });
	<div>
		@for (const day of s.picked; key day) { <span>{day}</span> }
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(
		compiled.semanticGraph.keyedRepeats.map((repeat) => [
			repeat.collectionGraphNodeId,
			repeat.collectionPath,
		]),
	).toEqual([['state:s', ['picked']]]);
});

test('a nested @for over the outer row item is not refused', async () => {
	const compiled = await compile(
		'src/nested.tsrx',
		`
import { state } from '@markless/core';
export function List() @{
	const s = state({ groups: [{ id: 'a', items: ['x'] }] });
	<div>
		@for (const group of s.groups; key group.id) {
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

test('a component prop collection is not refused', async () => {
	const compiled = await compile(
		'src/prop.tsrx',
		`
export function List({ items }: { items: readonly string[] }) @{
	<div>
		@for (const item of items; key item) { <span>{item}</span> }
	</div>
}
`,
	);

	expect(errors(compiled)).toEqual([]);
	expect(compiled.semanticGraph.keyedRepeats).toHaveLength(1);
});
