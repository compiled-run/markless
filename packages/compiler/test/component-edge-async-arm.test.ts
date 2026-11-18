// A component placed inside an @try names the arm that holds it, so composition files its @if records with that arm.
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const PAGE = `import { computed, state } from '@markless/core';
function Note({ text }: { text: string }) @{
	let open = state(false);
	<p onClick={() => (open = !open)}>
		@if (open) {
			<span>{text}</span>
		}
	</p>
}
export default function Page() @{
	const report = computed(async () => 'ready');
	<main>
		<Note text="outside" />
		@try {
			<Note text={report} />
		} @pending {
			<Note text="waiting" />
		} @catch (failure) {
			<Note text="failed" />
		}
	</main>
}`;

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result;
}

test('each edge names its @try and the arm it sits in', async () => {
	const result = await compile(PAGE);
	expect(
		result.semanticGraph.componentEdges
			.toSorted((left, right) => left.sourceSpan!.start - right.sourceSpan!.start)
			.map((edge) => [edge.asyncBoundaryId, edge.asyncBoundaryArm]),
	).toEqual([
		[undefined, undefined],
		['boundary:0', 0],
		['boundary:0', 1],
		['boundary:0', 2],
	]);
});

test('alternate shape: a nested @try names the inner boundary and its arm', async () => {
	const result = await compile(`import { computed } from '@markless/core';
function Badge({ label }: { label: string }) @{
	<em>{label}</em>
}
export function Board() @{
	const first = computed(async () => 'a');
	const second = computed(async () => 'b');
	<section>
		@try {
			<div>
				<b>{first}</b>
				@try {
					<i>{second}</i>
				} @catch (problem) {
					<Badge label="inner" />
				}
			</div>
		} @pending {
			<Badge label="outer" />
		}
	</section>
}`);
	expect(
		result.semanticGraph.componentEdges
			.toSorted((left, right) => left.sourceSpan!.start - right.sourceSpan!.start)
			.map((edge) => [edge.asyncBoundaryId, edge.asyncBoundaryArm]),
	).toEqual([
		['boundary:1', 2],
		['boundary:0', 1],
	]);
});
