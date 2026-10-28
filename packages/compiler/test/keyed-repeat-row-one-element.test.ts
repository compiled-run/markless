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

test('a row of two elements fails the build instead of keeping only its first element', async () => {
	const compiled = await compileList(`<p>
		@for (const part of parts; key part.k) {
			<><span>{part.text}</span><mark>{part.mark}</mark></>
		}
	</p>`);
	expect(refusals(compiled)).toEqual([
		{
			severity: 'error',
			message: 'Each row of this @for over part renders 2 nodes side by side',
		},
	]);
	expect(compiled.protocolView.keyedRepeats ?? []).toEqual([]);
});

test('a row of text beside an element, or of text alone, fails the build', async () => {
	const beside = await compileList(`<p>
		@for (const part of parts; key part.k) {
			<>{part.text}<mark>{part.mark}</mark></>
		}
	</p>`);
	const alone = await compileList(`<p>
		@for (const part of parts; key part.k) {
			{part.text}
		}
	</p>`);
	expect(refusals(beside)).toEqual([
		{
			severity: 'error',
			message: 'Each row of this @for over part renders 2 nodes side by side, 1 of them text',
		},
	]);
	expect(refusals(alone)).toEqual([
		{ severity: 'error', message: 'Each row of this @for over part renders only text' },
	]);
});

test('a row that is an @if whose arm holds two elements fails the build', async () => {
	const compiled = await compileList(`<p>
		@for (const part of parts; key part.k) {
			@if (part.mark) { <><b>{part.text}</b><i>{part.mark}</i></> } @else { <span>{part.text}</span> }
		}
	</p>`);
	expect(refusals(compiled)).toEqual([
		{
			severity: 'error',
			message:
				'Each row of this @for over part renders one @if with an arm of 2 nodes side by side',
		},
	]);
});

test('a nested row of two elements fails the build inside an outer row', async () => {
	const compiled = await compileList(`<ul>
		@for (const group of groups; key group.id) {
			<li>
				@for (const part of group.parts; key part.k) {
					<><b>{part.text}</b><i>{part.mark}</i></>
				}
			</li>
		}
	</ul>`);
	expect(refusals(compiled)).toEqual([
		{
			severity: 'error',
			message: 'Each row of this @for over part renders 2 nodes side by side',
		},
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
