import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import { buildSemanticGraphSync } from '../src/passes/semantic-graph/index.ts';

// A plain form that may post, inside a @try with a @catch and with no submit handler, is one the runtime sends in place.

const page = (
	form: string,
	around = (inside: string) => inside,
) => `import { computed, state } from '@markless/core';

export default function Shelf() @{
	const todos = computed(async () => {
		const response = await fetch('/api/todos');
		return (await response.json()) as Array<{ id: number; title: string }>;
	});
	let draft = state('');
	const method = 'post';

	${around(`@try {
		<section>
			${form}
			<ul>@for (const todo of todos; key todo.id) { <li>{todo.title}</li> }</ul>
		</section>
	} @pending { <p>Loading</p> } @catch (error, reset) { <p>{error.message}</p> }`)}
}
`;

async function compile(source: string) {
	return compileTsrxModule({
		filename: '/src/shelf.tsrx',
		buildId: 'in-place',
		resolverId: 'in-place',
		symbols: [],
		source,
	});
}

async function submitRecords(source: string) {
	const { protocolView } = await compile(source);
	const sets = protocolView.asyncBoundaries.flatMap((boundary) =>
		Array.isArray(boundary.armRecords)
			? boundary.armRecords
			: boundary.armRecords
				? [boundary.armRecords]
				: [],
	);
	return [...protocolView.events, ...sets.flatMap((set) => set.events)].filter(
		(event) => event.eventName === 'submit',
	);
}

const fields = '<input name="title" /><button>Add</button>';

test('a form posting with no handler inside a @try becomes a submit record the runtime sends in place, and its @catch takes failures', async () => {
	const source = page(`<form method="post" action="/api/todos">${fields}</form>`);
	expect(await submitRecords(source)).toEqual([
		{
			hostNodeId: expect.any(String),
			eventName: 'submit',
			syncPolicy: { when: { type: 'submits-in-place' }, actions: ['preventDefault'] },
			symbolIds: [],
			inPlaceSubmit: 'reset',
		},
	]);
	const [boundary] = (await compile(source)).protocolView.asyncBoundaries;
	expect(boundary).toMatchObject({
		catchesHandlers: true,
		runnerGraphNodeId: expect.stringMatching(/asyncGate/),
	});
});

test('the method is read from the markup, in any case, written as a string or an expression', async () => {
	for (const method of ['method="POST"', "method={'post'}", 'method={method}'])
		expect(
			await submitRecords(page(`<form ${method} action="/api/todos">${fields}</form>`)),
		).toHaveLength(1);
});

test('a form that does not post, or might hide its method in a spread, stays the browser’s', async () => {
	for (const form of [
		`<form action="/api/todos">${fields}</form>`,
		`<form method="get" action="/api/todos">${fields}</form>`,
		`<form method="dialog">${fields}</form>`,
		`<form {...{ method: 'post' }} action="/api/todos">${fields}</form>`,
	])
		expect(await submitRecords(page(form))).toEqual([]);
});

test('a form with a submit handler, on it or around it, is that handler’s', async () => {
	const handled = 'onSubmit={(event) => { event.preventDefault(); draft = ""; }}';
	expect(
		(
			await submitRecords(
				page(`<form method="post" action="/api/todos" ${handled}>${fields}</form>`),
			)
		).map((record) => record.inPlaceSubmit),
	).toEqual([undefined]);
	const around = await submitRecords(
		page(`<div ${handled}><form method="post" action="/api/todos">${fields}</form></div>`),
	);
	expect(around.map((record) => record.inPlaceSubmit)).toEqual([undefined]);
});

test('a form outside any @try with a @catch has no record, so the browser sends it', async () => {
	const outside = `<form method="post" action="/api/todos">${fields}</form>`;
	expect(await submitRecords(page('', (inside) => `<main>${outside}${inside}</main>`))).toEqual(
		[],
	);
	const noCatch = `import { computed } from '@markless/core';
export default function Shelf() @{
	const todos = computed(async () => (await fetch('/api/todos')).json() as Promise<Array<{ id: number }>>);
	@try { <section>${outside}<ul>@for (const todo of todos; key todo.id) { <li>{todo.id}</li> }</ul></section> } @pending { <p>Loading</p> }
}
`;
	expect(await submitRecords(noCatch)).toEqual([]);
});

test('a field bound to state keeps the form as it is after a send; an authored aria-disabled on its submitter is carried', async () => {
	const bound = `<form method="post" action="/api/todos"><input name="title" value={draft} onInput={(event) => (draft = (event.target as HTMLInputElement).value)} /><button aria-disabled="false">Add</button></form>`;
	expect(await submitRecords(page(bound))).toMatchObject([
		{ inPlaceSubmit: 'keep', authoredSubmitAriaDisabled: true },
	]);
});

test('an authored aria-busy on a form sent in place is refused, as on a form whose handler returns a promise', () => {
	const diagnostics = buildSemanticGraphSync({
		filename: 'shelf.tsrx',
		source: page(`<form method="post" action="/api/todos" aria-busy="false">${fields}</form>`),
	}).diagnostics.filter((diagnostic) => diagnostic.code === 'MARKLESS_ASYNC_ARIA_BUSY_MANAGED');
	expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
		'aria-busy on this form is managed while Markless sends it; style the busy form with form[aria-busy="true"] instead.',
	]);
});

test('a page whose forms do not post compiles to the same output as before', async () => {
	const without = page(`<form method="get" action="/search">${fields}</form>`);
	const compiled = await compile(without);
	const [boundary] = compiled.protocolView.asyncBoundaries;
	expect(boundary).not.toHaveProperty('catchesHandlers');
	expect(compiled.semanticGraph.events).toEqual([]);
});

const rowsPage = (child: string, uses: string, exported = '') => `import { computed } from '@markless/core';

${exported}function RowForm({ id }: { id: string }) @{
	${child}
}

export default function Shelf() @{
	const todos = computed(async () => [{ id: 'a' }, { id: 'b' }]);

	${uses}
	@try {
		<section>
			<ul>@for (const todo of todos; key todo.id) { <li><RowForm id={todo.id} /></li> }</ul>
			<RowForm id="outside" />
		</section>
	} @pending { <p>Loading</p> } @catch (error) { <p>{error.message}</p> }
}
`;
const rowForm = `<form method="post" action="/api/todos"><button name="todoId" value={id}>Done</button></form>`;

test('a form in another component of the file, rendered only inside a @try with a @catch, is sent in place too', async () => {
	const source = rowsPage(rowForm, '');
	expect((await submitRecords(source)).map((record) => record.inPlaceSubmit)).toEqual(['keep']);
	expect((await compile(source)).protocolView.asyncBoundaries[0]).toMatchObject({
		catchesHandlers: true,
		runnerGraphNodeId: expect.stringMatching(/asyncGate/),
	});
});

test('a form in another component stays the browser’s when that component can render outside a @try with a @catch', async () => {
	expect(await submitRecords(rowsPage(rowForm, '<RowForm id="bare" />'))).toEqual([]);
	expect(await submitRecords(rowsPage(rowForm, '', 'export '))).toEqual([]);
	expect(await submitRecords(rowsPage(rowForm, 'const Alias = RowForm;'))).toEqual([]);
});

// The full compile refuses a tag outside a component body as a syntax error; the pass itself must still not fail open.
test('a tag the pass sees outside any component body counts as a place the component renders, so its form stays the browser’s', () => {
	const inPlace = (source: string) =>
		buildSemanticGraphSync({ filename: 'shelf.tsrx', source }).events.filter((event) => event.inPlaceSubmit);
	const plain = `import { computed } from '@markless/core';
function RowForm() @{
	<form method="post" action="/api/todos"><button>Done</button></form>
}
export default function Shelf() @{
	const todos = computed(async () => [1]);
	@try { <section><RowForm /></section> } @pending { <p>Loading</p> } @catch (error) { <p>{error.message}</p> }
}
`;
	expect(inPlace(plain)).toHaveLength(1);
	expect(inPlace(plain.replace('export default', 'const loose = <RowForm />;\nexport default'))).toEqual([]);
	expect(inPlace(plain.replace('export default', 'function loose() { return <RowForm />; }\nexport default'))).toEqual([]);
});

const leavesPage = (source: string) =>
	buildSemanticGraphSync({ filename: 'shelf.tsrx', source }).diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_ASYNC_POST_FORM_LEAVES_PAGE',
	);

test('a form left to the browser though it renders in a @try with a @catch warns, naming why: exported', () => {
	const [warning, ...rest] = leavesPage(rowsPage(rowForm, '', 'export '));
	expect(rest).toEqual([]);
	expect(warning).toMatchObject({ severity: 'warning', primarySpan: expect.objectContaining({ start: expect.any(Number) }) });
	expect(warning!.message).toBe(
		'This form posts and has no submit handler, so the browser sends it and leaves the page to show the answer, even though it renders inside a @try with a @catch: <RowForm> is exported, so another file could render it where no @catch shows a failed send.',
	);
	expect(warning!.suggestions[0]!.message).toContain('Stop exporting <RowForm> and use it only in this file');
});

test('the warning reaches the build’s diagnostics as a warning', async () => {
	const compiled = await compile(rowsPage(rowForm, '', 'export '));
	expect(
		collectTsrxModuleDiagnostics(compiled)
			.filter((diagnostic) => diagnostic.code === 'MARKLESS_ASYNC_POST_FORM_LEAVES_PAGE')
			.map((diagnostic) => diagnostic.severity),
	).toEqual(['warning']);
});

test('the same, used as a value', () => {
	const [warning, ...rest] = leavesPage(rowsPage(rowForm, 'const Alias = RowForm;'));
	expect(rest).toEqual([]);
	expect(warning!.message).toContain('<RowForm> is also used as a value, not only as a tag');
	expect(warning!.suggestions[0]!.message).toContain('Use <RowForm> only as a tag');
});

test('the same, also rendered outside the @try, naming where', () => {
	const [warning, ...rest] = leavesPage(`import { computed } from '@markless/core';
function RowForm({ id }: { id: string }) @{
	${rowForm}
}
export default function Shelf() @{
	const todos = computed(async () => [{ id: 'a' }]);
	<main>
		<RowForm id="bare" />
		@try {
			<ul>@for (const todo of todos; key todo.id) { <li><RowForm id={todo.id} /></li> }</ul>
		} @pending { <p>Loading</p> } @catch (error) { <p>{error.message}</p> }
	</main>
}
`);
	expect(rest).toEqual([]);
	expect(warning!.message).toContain('<RowForm> is also rendered in <Shelf>, where this file cannot show a @try with a @catch around it');
	expect(warning!.suggestions[0]!.message).toContain('Render <RowForm> only inside a @try with a @catch');
});

test('no warning for a form sent in place, one outside any @try, or one that asks for the browser', async () => {
	expect(leavesPage(rowsPage(rowForm, ''))).toEqual([]);
	expect(leavesPage(page(`<form method="post" action="/api/todos">${fields}</form>`))).toEqual([]);
	expect(leavesPage(page('', (inside) => `<main><form method="post" action="/api/todos">${fields}</form>${inside}</main>`))).toEqual([]);
	for (const attribute of ['rel="external"', 'target="_blank"', 'action="https://pay.example/checkout"'])
		expect(
			leavesPage(rowsPage(`<form method="post" ${attribute}><button>Pay</button></form>`, '', 'export ')),
		).toEqual([]);
	expect(leavesPage(rowsPage(`<form method="post" action="/api/todos" onSubmit={() => {}}><button>Go</button></form>`, '', 'export '))).toEqual([]);
});
