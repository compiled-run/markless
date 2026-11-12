import { expect, test } from 'vitest';
import { buildSemanticGraphSync } from '../src/passes/semantic-graph/index.ts';
import { collectTsrxAuthorWarnings, collectTsrxRefreshHovers } from '../src/type-service.ts';

const CODE = 'MARKLESS_ASYNC_INPUT_BESIDE_VALUE';

function warnings(source: string) {
	return buildSemanticGraphSync({ filename: 'page.tsrx', source }).diagnostics.filter(
		(diagnostic) => diagnostic.code === CODE,
	);
}

function spanText(source: string, span: { start: number; end: number } | undefined) {
	return span ? source.slice(span.start, span.end) : undefined;
}

const feed = (
	tryContent: string,
	outside = '',
) => `import { computed, state } from '@markless/core';

export function Feed() @{
	let sort = state('new');
	let clicks = state(0);
	const posts = computed(async () => {
		const by = sort;
		const response = await fetch('/posts?sort=' + by);
		const list = (await response.json()) as Array<{ id: string; title: string }>;
		return { sort: by, list };
	});

	<main>
		${outside}
		@try {
			<>
				${tryContent}
				<ul>
					@for (const post of posts.list; key post.id) {
						<li>{post.title}</li>
					}
				</ul>
			</>
		} @pending {
			<p>Loading {sort}</p>
		}
	</main>
}
`;

test('text inside a @try reading an input of its async value, without the value, warns', () => {
	const source = feed('<p>Sorted by {sort}</p>');
	const [warning, ...rest] = warnings(source);
	expect(rest).toEqual([]);
	expect(warning).toMatchObject({ severity: 'warning', code: CODE });
	expect(spanText(source, warning?.primarySpan)).toBe('sort');
	expect(warning?.message).toContain('"sort"');
	expect(warning?.message).toContain('"posts"');
	expect(warning?.message).toMatch(/new "sort" next to the old "posts"/);
	expect(warning?.suggestions?.[0]?.message).toMatch(/through the async value/);
	expect(warning?.docsUrl).toBe(`https://markless.dev/errors/${CODE}`);
});

test('the warning reaches the editor and the type checker', () => {
	const found = collectTsrxAuthorWarnings(feed('<p>Sorted by {sort}</p>'), 'page.tsrx');
	expect(found.map((warning) => warning.code)).toContain(CODE);
});

test('alternate shapes: an input reached through a sync computed, an upstream async value and a prop', () => {
	const source = `import { computed, state } from '@markless/core';

const labels: Record<string, string> = { a: 'Alpha', b: 'Beta' };

function Board({ team }: { team: string }) @{
	let order = state('a');
	const orderName = computed(() => labels[order]);
	const roster = computed(async () => {
		const pick = order;
		const res = await fetch('/team/' + team + '?order=' + pick);
		return (await res.json()) as { names: string[] };
	});
	const detail = computed(async () => {
		const first = roster.names[0];
		return { first };
	});

	<section>
		@try {
			<article>
				<h3 data-order>{orderName}</h3>
				<em data-team>Team {team}</em>
				<strong>{detail.first}</strong>
			</article>
		} @pending {
			<p>Loading</p>
		}
	</section>
}

export function Page() @{
	<Board team="red" />
}
`;
	const found = warnings(source)
		.map((warning) => spanText(source, warning.primarySpan))
		.sort();
	expect(found).toEqual(['orderName', 'team']);
});

test('no warning when the text reads the async value, sits outside the block or in another arm, or reads a non-input', () => {
	const shapes = [
		'<p>Sorted by {posts.sort}</p>',
		'<p>Sorted by {sort}, {posts.list.length} posts</p>',
		'<p>Clicked {clicks}</p>',
		'<p>Static text</p>',
	];
	for (const shape of shapes) expect(warnings(feed(shape)), shape).toEqual([]);
	expect(warnings(feed('', '<p>Sorted by {sort}</p>')), 'outside the block').toEqual([]);
});

test('no warning for form controls that show or write the input', () => {
	const shapes = [
		`<select value={sort} onChange={(event) => (sort = event.currentTarget.value)}><option value="new">New</option></select>`,
		`<input value={sort} onInput={(event) => (sort = event.currentTarget.value)} />`,
		`<button type="button" onClick={() => (sort = 'top')}>Sort: {sort}</button>`,
		`<span role="button" onClick={() => (sort = 'old')}>Order {sort}</span>`,
		`<label>Sort {sort}</label>`,
	];
	for (const shape of shapes) expect(warnings(feed(shape)), shape).toEqual([]);
	expect(
		warnings(feed(`<span>Order {sort}</span>`)),
		'the same text with no control',
	).toHaveLength(1);
	expect(
		warnings(feed(`<span onClick={() => (clicks = 1)}>Order {sort}</span>`)),
		'a handler that writes something else',
	).toHaveLength(1);
});

function at(source: string, search: string, offset = 1) {
	const start = source.indexOf(search);
	if (start === -1) throw new Error(`Missing ${search}`);
	return start + offset;
}

function hoverAt(source: string, position: number) {
	return collectTsrxRefreshHovers(source, 'page.tsrx').find(
		(hover) => hover.start <= position && position <= hover.end,
	);
}

test('hovering @try explains what a refresh does there', () => {
	const source = feed('<p>Sorted by {posts.sort}</p>');
	const hover = hoverAt(source, at(source, '@try'));
	expect(spanText(source, hover)).toBe('@try');
	expect(hover?.text).toBe(
		'When `sort` changes, `posts` runs again: this block keeps its content and marks `<p>`, `<ul>` busy until the new result lands. Text here that reads `posts` keeps the `sort` it was fetched with.',
	);
});

test('hovering an async read explains its refresh; a plain state read has no refresh hover', () => {
	const source = feed('<p>Sorted by {posts.sort}</p>');
	const read = hoverAt(source, at(source, 'posts.list;'));
	expect(spanText(source, read)).toBe('posts');
	expect(read?.text).toBe(
		'When `sort` changes, `posts` runs again: the block keeps showing the current `posts` and marks `<p>`, `<ul>` busy until the new result lands. Text that reads `posts` keeps the `sort` it was fetched with.',
	);
	expect(hoverAt(source, at(source, 'const posts') + 7)?.text).toBe(read?.text);
	expect(hoverAt(source, at(source, 'const by = sort') + 11)).toBeUndefined();
});

test('an async value that reads no input says it never refreshes', () => {
	const source = `import { computed } from '@markless/core';

export function Profile() @{
	const user = computed(async () => (await fetch('/me')).json() as Promise<{ name: string }>);

	<main>
		@try {
			<h1>{user.name}</h1>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
`;
	expect(hoverAt(source, at(source, '@try'))?.text).toBe(
		'`user` reads no state or prop, so it runs once and never refreshes. To refresh it, read a counter in its recipe (`let reload = state(0)`) and bump it.',
	);
});

const pager = (markup: string) => `import { computed, state } from '@markless/core';

export function Pager() @{
	let page = state(1);
	const rows = computed(async () => (await fetch('/rows?page=' + page)).json() as Promise<{ count: number; pages: number[] }>);

	<main>
		@try {
			<section>${markup}</section>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
`;

function writtenByControl(source: string) {
	const graph = buildSemanticGraphSync({ filename: 'pager.tsrx', source });
	return graph.templateReads.flatMap((read) => {
		const binding = graph.graphBindings.find((candidate) => candidate.id === read.computedGraphNodeId);
		const written = (binding?.dependencies ?? []).filter((dependency) => dependency.writtenByControl);
		return written.length > 0 ? [written.map((dependency) => dependency.source).join(',')] : [];
	});
}

test('text in a control joining the state its own handler writes with fetched data reads that state as written', () => {
	expect(writtenByControl(pager('<button onClick={() => (page = page + 1)}>Page {page} of {rows.count}</button>'))).toEqual(['page']);
	expect(writtenByControl(pager('<button onClick={() => (page = page + 1)}><span>Page {page} of {rows.count}</span></button>'))).toEqual(['page']);
});

test('text outside the writing control, in a container with a handler, or in a control that writes nothing it shows stays matched', () => {
	expect(writtenByControl(pager('<button onClick={() => (page = page + 1)}>Next</button><p>Page {page} of {rows.count}</p>'))).toEqual([]);
	expect(writtenByControl(pager('<div onClick={() => (page = page + 1)}><p>Page {page} of {rows.count}</p></div>'))).toEqual([]);
	expect(writtenByControl(pager('<button onClick={() => console.log(page)}>Page {page} of {rows.count}</button>'))).toEqual([]);
	expect(writtenByControl(pager('<ul>@for (const n of rows.pages; key n) {<li><button onClick={() => (page = n)}>{n}: {page} of {rows.count}</button></li>}</ul>'))).toEqual([]);
});

const propFetched = (armTest: string, tryText: string) => `import { computed } from '@markless/core';

export default function Editor({ subject, tick }: { subject: number | null; tick: number }) @{
	const attempts = 0;
	const record = computed(async () => {
		void tick;
		return subject === null ? null : { title: 'r' + subject };
	});

	@if (${armTest}) {
		@try {
			<section>
				<p>{record?.title}</p>
				<p>${tryText}</p>
			</section>
		} @pending {
			<p>loading</p>
		}
	}
}
`;

test('text that shows a prop the async value is fetched with names that prop', () => {
	const found = warnings(propFetched('subject !== null', '{subject}'));
	expect(found.map((diagnostic) => diagnostic.message)).toEqual([
		'{subject} reads "subject", which "record" is fetched with, but not "record" itself. During a refresh it shows the new "subject" next to the old "record".',
	]);
});

test('a constant shown inside an @if on a prop does not read the prop the @if tests', () => {
	expect(warnings(propFetched('subject !== null', '{attempts + 1}'))).toEqual([]);
	expect(warnings(propFetched('tick > 0', '{attempts + 1}'))).toEqual([]);
});
