import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

const family = `
import { shared, state, computed } from '@markless/core';

export const calendarState = shared(() => {
	const s = state({ picked: ['a', 'b'] as readonly string[] });
	const days = computed(() => s.picked.map((one) => one + '!'));
	return { ...s, days };
}, { scope: 'widget' });

export function CalendarRoot({ children }) @{
	const cal = calendarState();
	<div data-root>{children}</div>
}
`;

const definitionId = 'shared:src/cal.tsrx#calendarState';

// A part adopts the instance, names one of its cells with a `const`, and repeats
// over the name. The instance local exists only inside the component function,
// so a repeat header left holding `days` renders in a scope that has no `cal`.
const aliasRepeat = `${family}
export function CalendarList() @{
	const cal = calendarState();
	const days = cal.days;
	<div>
		@for (const day of days; key day) { <span>{day}</span> }
	</div>
}
`;

test('a const naming an instance computed carries that cell into the repeat header', async () => {
	const compiled = await compile('src/cal.tsrx', aliasRepeat);

	expect(
		compiled.semanticGraph.keyedRepeats.map((repeat) => [
			repeat.collectionSource,
			repeat.collectionGraphNodeId,
			repeat.collectionPath,
		]),
	).toEqual([['days', `${definitionId}/computed:days`, []]]);
});

// The emitted server body drops the instance local, so a declaration reading
// through it would throw before the first row is built.
test('the emitted server body keeps no local declared from the instance', async () => {
	const compiled = await compile('src/cal.tsrx', aliasRepeat);
	const ssr = compiled.publicRenderModule.ssrModuleSource;

	expect(ssr).not.toContain('const days = cal.days');
	expect(ssr).not.toMatch(/case "repeat:\d+":return \(days\);/);
});

test('the repeat compiles with no diagnostic', async () => {
	const compiled = await compile('src/cal.tsrx', aliasRepeat);

	expect(
		[...compiled.semanticGraph.diagnostics, ...compiled.stateLowering.diagnostics].filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
	).toEqual([]);
});

// The same name in a template position, which is the read half of the ruling:
// `const weekdays = cal.weekdays` has to answer wherever it is read.
test('a const naming an instance cell resolves in a template read', async () => {
	const compiled = await compile(
		'src/cal.tsrx',
		`${family}
export function CalendarCount() @{
	const cal = calendarState();
	const picked = cal.picked;
	<div data-count>{picked.length}</div>
}
`,
	);

	expect(compiled.publicRenderModule.ssrModuleSource).not.toContain('const picked = cal.picked');
	expect(
		compiled.stateLowering.reads.some(
			(read) =>
				read.source === 'picked.length' && read.graphNodeId === `${definitionId}/state:s`,
		),
	).toBe(true);
});

// A plain component-scope `state()` cell behind a `const`, the same shape with
// no shared instance in it.
test('a const naming a plain state path carries that path into the repeat header', async () => {
	const compiled = await compile(
		'src/plain.tsrx',
		`
import { state } from '@markless/core';
export function List() @{
	const s = state({ picked: ['a', 'b'] as readonly string[] });
	const days = s.picked;
	<div>
		@for (const day of days; key day) { <span>{day}</span> }
	</div>
}
`,
	);

	expect(
		compiled.semanticGraph.keyedRepeats.map((repeat) => [
			repeat.collectionGraphNodeId,
			repeat.collectionPath,
		]),
	).toEqual([['state:s', ['picked']]]);
});

// A `let` can be reassigned to something off the graph, so it stays an authored
// local rather than becoming a path alias.
test('a let naming a graph path is not carried as an alias', async () => {
	const compiled = await compile(
		'src/let.tsrx',
		`
import { state } from '@markless/core';
export function List() @{
	const s = state({ picked: ['a'] as readonly string[] });
	let days = s.picked;
	<div data-root>{s.picked.length}</div>
}
`,
	);

	expect(compiled.semanticGraph.aliases.map((alias) => alias.name)).not.toContain('days');
});
