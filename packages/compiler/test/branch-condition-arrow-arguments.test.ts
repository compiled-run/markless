import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A branch condition that passes a function to an array method: an expression-bodied arrow becomes a computed,
// and a function whose body hides its reads stops the build instead of rendering a condition that never updates.

const page = (condition: string, inline = false) => `
import { state } from '@markless/core';

const IDS = [1, 2, 3];

function Row({ post, opened }: { post: { id: number }; opened: number[] }) @{
	<li>
		@if (${inline ? 'true' : condition}) {
			<span>open</span>
		}
	</li>
}

export default function Page() @{
	let posts = state([{ id: 1 }, { id: 2 }]);
	let opened = state<number[]>([]);

	<ul>
		@for (const post of posts; key post.id) {
			${inline ? `<li>@if (${condition}) { <span>open</span> }</li>` : '<Row post={post} opened={opened} />'}
		}
	</ul>
}
`;

async function compile(condition: string, inline = false) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source: page(condition, inline), symbols: [] });
	const refusals = result.semanticGraph.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_TEMPLATE_EXPRESSION_UNSUPPORTED',
	);
	return { result, refusals };
}

test.each([
	['opened.some((id) => id === post.id)', ['opened', 'post.id']],
	['opened.every((id) => id !== post.id)', ['opened', 'post.id']],
	['opened.find((id) => id === post.id)', ['opened', 'post.id']],
	['opened.filter((id) => id <= post.id).length > 1', ['opened', 'post.id']],
	['opened.some(({ toFixed }) => toFixed === post.id)', ['opened', 'post.id']],
	['opened.some((id) => IDS.some((other) => other === id + post.id))', ['opened', 'post.id']],
])('semantic-graph: %s becomes a computed over %j', async (condition, sources) => {
	const { result, refusals } = await compile(condition);
	const site = result.semanticGraph.branchSites[0]!;
	const computed = result.semanticGraph.graphBindings.find((binding) => binding.id === site.testComputedGraphNodeId);
	expect(computed?.dependencies?.map((dependency) => dependency.source)).toEqual(sources);
	expect(refusals).toEqual([]);
});

test.each([
	'opened.some((id) => { return id === post.id; })',
	'opened.some(function (id) { return id === post.id; })',
	'opened.some(async (id) => id === post.id)',
	'opened.some((id) => opened.some((other) => { return other === id; }))',
])('semantic-graph: %s stops the build and names the function', async (condition) => {
	const { result, refusals } = await compile(condition);
	expect(result.semanticGraph.branchSites[0]!.testComputedGraphNodeId).toBeUndefined();
	expect(refusals).toHaveLength(1);
	expect(refusals[0]!.severity).toBe('error');
	expect(refusals[0]!.message).toBe(
		`This branch condition is written as \`${condition}\`, which reads state but is not an expression this compiler can keep current.`,
	);
	const span = refusals[0]!.primarySpan;
	expect(page(condition).slice(span.start, span.end)).toMatch(/^(?:async |function|\()/);
});

test('semantic-graph: a function over module values alone is left as it renders', async () => {
	const { refusals } = await compile('IDS.some((id) => { return id > 2; })');
	expect(refusals).toEqual([]);
});

test('semantic-graph: a row written inline in the @for keeps deciding its condition with the row', async () => {
	const { result, refusals } = await compile('opened.some((id) => { return id === post.id; })', true);
	expect(result.semanticGraph.branchSites.at(-1)!.keyedRepeatId).toBeDefined();
	expect(refusals).toEqual([]);
});
