import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

// Holes sharing one text node update as one joined value, which cannot read the async
// value its @try block settles; the state write would otherwise erase the async text.
async function codesFor(markup: string) {
	const graph = await buildSemanticGraph({
		filename: 'src/page.tsrx',
		source: `import { computed, state } from '@markless/core';
export default function Page() @{
	const data = computed(async () => ({ title: 'Inbox', sub: 'all' }));
	let count = state(0);
	<section>
		@try {
			${markup};
		} @pending {
			<p>loading</p>;
		}
	</section>
}
`,
	});
	return graph.diagnostics.map((diagnostic) => diagnostic.code);
}

test('an async value and state in one run of text is refused', async () => {
	expect(
		await codesFor(`<button onClick={() => (count = count + 1)}>{data.title} {count}</button>`),
	).toContain('MARKLESS_ASYNC_TEXT_JOIN_UNSUPPORTED');
});

test('the async value in its own element beside the state is accepted', async () => {
	expect(
		await codesFor(
			`<button onClick={() => (count = count + 1)}><span>{data.title}</span> {count}</button>`,
		),
	).not.toContain('MARKLESS_ASYNC_TEXT_JOIN_UNSUPPORTED');
});

test('two reads of the same async value in one run of text are accepted', async () => {
	expect(await codesFor(`<p>{data.title} / {data.sub}</p>`)).not.toContain(
		'MARKLESS_ASYNC_TEXT_JOIN_UNSUPPORTED',
	);
});
