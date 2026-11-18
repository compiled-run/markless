import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const NOT_ONE_ELEMENT = 'MARKLESS_KEYED_REPEAT_ROW_NOT_ONE_ELEMENT';

async function compileList(body: string) {
	return compileTsrxModule({
		filename: 'src/Lists.tsrx',
		source: `import { computed, state } from '@markless/core';

export function Lists() @{
	let term = state('');
	const groups = computed(() => (term ? [{ id: 'a', parts: [{ k: 0, text: 'x', mark: 'y' }] }] : []));
	const parts = computed(() => (term ? [{ k: 0, text: 'x', mark: 'y' }] : []));
	const fixed = [{ k: 0, text: 'x', mark: 'y' }];
	${body}
}
`,
		symbols: [],
	});
}

const refusals = (compiled: Awaited<ReturnType<typeof compileList>>) =>
	compiled.publicRenderPlan.diagnostics
		.filter((entry) => entry.code === NOT_ONE_ELEMENT)
		.map((entry) => ({ severity: entry.severity, message: entry.message.split('.')[0] }));

const reasons = (compiled: Awaited<ReturnType<typeof compileList>>) =>
	compiled.publicRenderPlan.diagnostics
		.filter((entry) => entry.code === NOT_ONE_ELEMENT)
		.map((entry) => entry.message.split('. ')[0]);

test('a row of two elements builds, and the browser tracks it between row comments', async () => {
	const compiled = await compileList(`<p>
		@for (const part of parts; key part.k) {
			<><span onClick={() => part.k}>{part.text}</span><mark>{part.mark}</mark></>
		}
	</p>`);
	expect(refusals(compiled)).toEqual([]);
	const [repeat] = compiled.protocolView.keyedRepeats ?? [];
	expect(repeat?.rowRange).toBe(true);
	expect(compiled.renderData.repeats[0]?.rowRange).toBe(true);
	expect(repeat?.rowTemplate?.html).toBe(
		'<span><!--markless-slot:0--></span><mark><!--markless-slot:1--></mark>',
	);
	// Addresses start at the first node inside the row's comments, so the second element is step 1.
	expect(repeat?.rowEvents.map((event) => event.hostPath)).toEqual([[0]]);
});

test('a row of text beside an element, or of text alone, builds as a ranged row', async () => {
	const beside = await compileList(`<p>
		@for (const part of parts; key part.k) {
			<>{part.text}<mark onClick={() => part.k}>{part.mark}</mark></>
		}
	</p>`);
	const alone = await compileList(`<p>
		@for (const part of parts; key part.k) {
			{part.text}
		}
	</p>`);
	expect(refusals(beside)).toEqual([]);
	expect(refusals(alone)).toEqual([]);
	expect(beside.protocolView.keyedRepeats?.[0]?.rowRange).toBe(true);
	expect(beside.protocolView.keyedRepeats?.[0]?.rowEvents.map((event) => event.hostPath)).toEqual([
		[0],
	]);
	expect(alone.protocolView.keyedRepeats?.[0]?.rowRange).toBe(true);
	expect(alone.protocolView.keyedRepeats?.[0]?.rowTemplate?.textSlots).toEqual([
		{ path: [0], itemPath: ['text'] },
	]);
});

test('a one-element row pays nothing: no rowRange in its record or its render data', async () => {
	const compiled = await compileList(`<ul>
		@for (const part of parts; key part.k) { <li>{part.text}</li> }
	</ul>`);
	expect(compiled.protocolView.keyedRepeats?.[0]).not.toHaveProperty('rowRange');
	expect(compiled.renderData.repeats[0]).not.toHaveProperty('rowRange');
});

test('a row that is not one element and holds an @if still fails the build, naming why', async () => {
	const compiled = await compileList(`<p>
		@for (const part of parts; key part.k) {
			@if (part.mark) { <><b>{part.text}</b><i>{part.mark}</i></> } @else { <span>{part.text}</span> }
		}
	</p>`);
	expect(reasons(compiled)).toEqual([
		'Each row of this @for over part renders one @if with an arm of 2 nodes side by side, and this list has rows that hold an @if or @switch',
	]);
	expect(compiled.publicRenderPlan.diagnostics.find((entry) => entry.code === NOT_ONE_ELEMENT)?.suggestions?.[0]?.message).toBe(
		'Wrap each row in one element, such as `<span>...</span>`, so every row of part is a single element.',
	);
});

test('a nested row of two elements still fails the build inside an outer row', async () => {
	const compiled = await compileList(`<ul>
		@for (const group of groups; key group.id) {
			<li>
				@for (const part of group.parts; key part.k) {
					<><b>{part.text}</b><i>{part.mark}</i></>
				}
			</li>
		}
	</ul>`);
	expect(reasons(compiled)).toEqual([
		'Each row of this @for over part renders 2 nodes side by side, and this list sits inside the row of another @for',
	]);
});

test('a row of two elements that binds an element() handle or cancels before code loads still fails the build', async () => {
	const handle = await compileTsrxModule({
		filename: 'src/Lists.tsrx',
		source: `import { element, state } from '@markless/core';
export function Lists() @{
	let parts = state([{ k: 0, text: 'x' }]);
	const marks = element<HTMLElement[]>();
	<p>
		@for (const part of parts; key part.k) {
			<><b>{part.text}</b><mark el={marks}>{part.text}</mark></>
		}
	</p>
}
`,
		symbols: [],
	});
	expect(reasons(handle)).toEqual([
		'Each row of this @for over part renders 2 nodes side by side, and this list has rows that bind an element() handle',
	]);
});

test('rows that are one element, one @if, or rows of a list that never changes pass', async () => {
	const compiled = await compileList(`<main>
		<p>@for (const part of parts; key part.k) { <span>{part.text}<mark>{part.mark}</mark></span> }</p>
		<p>@for (const part of parts; key part.k) { @if (part.mark) { <mark>{part.text}</mark> } @else { <span>{part.text}</span> } }</p>
		<p>@for (const part of fixed; key part.k) { <>{part.text}<mark>{part.mark}</mark></> }</p>
	</main>`);
	expect(refusals(compiled)).toEqual([]);
});

test('an outer row whose nested rows are each an @if ships markup the browser builds it from', async () => {
	const compiled = await compileList(`<ul>
		@for (const group of groups; key group.id) {
			<li>
				@for (const part of group.parts; key part.k) {
					@if (part.mark) { <mark>{part.text}</mark> } @else { <span>{part.text}</span> }
				}
			</li>
		}
	</ul>`);
	const [outer, inner] = compiled.protocolView.keyedRepeats ?? [];
	expect(outer?.rowTemplate?.html).toBe('<li><!--markless-slot:0--></li>');
	expect(inner?.enclosingRow?.repeatId).toBe(outer?.id);
	expect(inner?.rowTemplate?.branchSlots).toHaveLength(1);
});

const emptyRows = (compiled: Awaited<ReturnType<typeof compileList>>) =>
	compiled.publicRenderPlan.diagnostics
		.filter((entry) => entry.code === 'MARKLESS_KEYED_REPEAT_ROW_CAN_BE_EMPTY')
		.map((entry) => ({
			severity: entry.severity,
			message: entry.message.split(',')[0],
			suggestion: entry.suggestions?.[0]?.message,
		}));

test('a row that is an @if with no @else fails the build and suggests filtering the list', async () => {
	const compiled = await compileList(`<ul>
		@for (const part of parts; key part.k) {
			@if (part.mark) { <li>{part.text}</li> }
		}
	</ul>`);
	expect(emptyRows(compiled)).toEqual([
		{
			severity: 'error',
			message: 'Each row of this @for over part is one @if (part.mark) with no @else',
			suggestion:
				'Filter the list before the @for instead: `const shown = computed(() => parts.filter((part) => part.mark));` and `@for (const part of shown; ...)`. Or give the @if an @else that renders one element.',
		},
	]);
});

test('an else-if chain without a final @else, and a @switch with no default, fail the build', async () => {
	const chain = await compileList(`<ul>
		@for (const part of parts; key part.k) {
			@if (part.mark === 'y') { <li>y</li> } @else if (part.mark) { <li>other</li> }
		}
	</ul>`);
	const choice = await compileList(`<ul>
		@for (const part of parts; key part.k) {
			@switch (part.mark) { @case 'y': { <li>y</li> } }
		}
	</ul>`);
	expect(emptyRows(chain).map((entry) => entry.message)).toEqual([
		"Each row of this @for over part is one @if (part.mark === 'y') with no @else",
	]);
	expect(emptyRows(choice).map((entry) => entry.message)).toEqual([
		'Each row of this @for over part is one @switch (part.mark) with no default case',
	]);
});

test('an @if with an @else, an @if inside the row element, or a fixed list never warns that a row can be empty', async () => {
	const compiled = await compileList(`<main>
		<ul>@for (const part of parts; key part.k) { @if (part.mark) { <li>{part.text}</li> } @else { <li>-</li> } }</ul>
		<ul>@for (const part of parts; key part.k) { <li>@if (part.mark) { <b>{part.text}</b> }</li> }</ul>
		<ul>@for (const part of fixed; key part.k) { @if (part.mark) { <li>{part.text}</li> } }</ul>
	</main>`);
	expect(emptyRows(compiled)).toEqual([]);
});

test('a list decided by props leaves both row checks to every caller', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/Runs.tsrx',
		source: `export function Runs({ runs }: { runs: ReadonlyArray<{ id: number; kind: string; text: string }> }) @{
	<p>
		@for (const run of runs; key run.id) {
			@if (run.kind === 'b') { <b>{run.text}</b> } @else { <>{run.text}</> }
		}
		@for (const run of runs; key run.id) {
			@if (run.kind === 'b') { <b>{run.text}</b> }
		}
	</p>
}
`,
		symbols: [],
	});
	expect(
		compiled.publicRenderPlan.diagnostics
			.filter((entry) => entry.code.startsWith('MARKLESS_KEYED_REPEAT_ROW_'))
			.map((entry) => [entry.code, entry.severity, entry.decidedByProps]),
	).toEqual([
		[
			'MARKLESS_KEYED_REPEAT_ROW_NOT_ONE_ELEMENT',
			'warning',
			{ componentName: 'Runs', props: ['runs'] },
		],
		[
			'MARKLESS_KEYED_REPEAT_ROW_CAN_BE_EMPTY',
			'warning',
			{ componentName: 'Runs', props: ['runs'] },
		],
	]);
});
