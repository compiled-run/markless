import { ASYNC_BOUNDARY_ARM, ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { marklessSsrRunAsyncComputed } from '../src/fns/ssr.ts';
import { renderToStream } from '../src/render-to-stream.ts';

const HELPERS = /from '@markless\/web\/fns\/([^']+)'/g;

async function compiledPage(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/Shelf.tsrx', source, symbols: [] });
	const errors = Object.values(compiled).flatMap((artifact) =>
		(
			(artifact as { diagnostics?: ReadonlyArray<{ severity: string; code: string }> })
				?.diagnostics ?? []
		).filter((diagnostic) => diagnostic.severity === 'error'),
	);
	expect(errors).toEqual([]);
	const ssr = compiled.publicRenderModule.ssrModuleSource.replace(
		HELPERS,
		(_match, helper: string) =>
			`from '${new URL(`../src/fns/${helper}.ts`, import.meta.url).href}'`,
	);
	const module = [
		`const payloadState = ${JSON.stringify(compiled.protocolState)};`,
		`const payloadView = ${JSON.stringify(compiled.protocolView)};`,
		`const marklessRenderData = ${JSON.stringify(compiled.renderData)};`,
		ssr,
		'export { marklessRenderSsr };',
	].join('\n');
	const loaded = (await import(
		`data:text/javascript;charset=utf-8,${encodeURIComponent(module)}`
	)) as { readonly marklessRenderSsr: (...args: unknown[]) => unknown };
	return { renderSsr: loaded.marklessRenderSsr };
}

async function drainWithin(appends: AsyncGenerator<string>, ms: number): Promise<string> {
	const chunks: string[] = [];
	const drained = (async () => {
		for await (const chunk of appends) chunks.push(chunk);
	})();
	const timedOut = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms));
	if ((await Promise.race([drained, timedOut])) === 'timeout')
		throw new Error(`appends did not finish within ${ms}ms`);
	return chunks.join('');
}

const LATER = `function later(value, ms) {
	return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}`;

// A child's own @try first renders when the streamed arm around it does, so the shell never listed it.
for (const shape of [
	{
		name: 'a row component',
		place: '<ul>@for (const id of list; key id) { <Note id={id} /> }</ul>',
		expected: ['<li data-note="">note of a</li>', '<li data-note="">note of b</li>'],
	},
	{
		name: 'a single child',
		place: '<section><h2>{list.length} notes</h2><Note id={list[0]} /></section>',
		expected: ['<li data-note="">note of a</li>'],
	},
]) {
	test(`${shape.name} with its own async value in a streamed arm streams that value, not its @pending`, async () => {
		const page = await compiledPage(`
import { computed } from '@markless/core';
${LATER}
function Note({ id }) @{
	const note = computed(async () => later('note of ' + id, 5));

	@try {
		<li data-note>{note}</li>
	} @pending {
		<li data-note-pending>loading {id}</li>
	}
}

export function Shelf() @{
	const list = computed(async () => later(['a', 'b'], 30));

	<main>
		@try {
			${shape.place}
		} @pending {
			<p>pending list</p>
		}
	</main>
}
`);
		const stream = await renderToStream(page as never, {});
		expect(stream.shell).toContain('pending list');
		const settled = await drainWithin(stream.appends(), 2_000);
		for (const line of shape.expected) expect(settled).toContain(line);
		expect(settled).not.toContain('data-note-pending');
	});
}

async function timedChunks(appends: AsyncGenerator<string>, ms: number) {
	const started = performance.now();
	const chunks: Array<{ readonly at: number; readonly html: string }> = [];
	const drained = (async () => {
		for await (const html of appends) chunks.push({ at: performance.now() - started, html });
	})();
	const timedOut = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms));
	if ((await Promise.race([drained, timedOut])) === 'timeout')
		throw new Error(`appends did not finish within ${ms}ms`);
	return chunks;
}

const NOTE = `function Note({ id, ms }) @{
	const note = computed(async () => later('note of ' + id, ms));

	@try {
		<li data-note>{note}</li>
	} @pending {
		<li data-note-pending>loading {id}</li>
	}
}`;

test("a sibling arm streams when it is ready, not when another arm's nested value is", async () => {
	const page = await compiledPage(`
import { computed } from '@markless/core';
${LATER}
${NOTE}

export function Shelf() @{
	const a = computed(async () => later('A', 20));
	const b = computed(async () => later('B', 20));
	const c = computed(async () => later('C', 150));

	<main>
		@try {
			<p data-a>{a}</p>
		} @pending {
			<p>pending a</p>
		}
		@try {
			<section><p data-b>{b}</p><ul><Note id="b" ms={600} /></ul></section>
		} @pending {
			<p>pending b</p>
		}
		@try {
			<p data-c>{c}</p>
		} @pending {
			<p>pending c</p>
		}
	</main>
}
`);
	const stream = await renderToStream(page as never, {});
	const chunks = await timedChunks(stream.appends(), 3_000);
	const holding = (text: string) => chunks.findIndex((chunk) => chunk.html.includes(text));
	const [a, b, c] = ['<p data-a', '<p data-b', '<p data-c'].map(holding);
	expect(a, 'A streams in its own chunk, before B').toBeLessThan(b!);
	expect(c, 'C streams when it settles, before B').toBeLessThan(b!);
	expect(chunks[a!]!.at, 'A does not wait for B\'s nested value').toBeLessThan(400);
	expect(chunks[c!]!.at, 'C does not wait for B\'s nested value').toBeLessThan(400);
	expect(chunks[b!]!.html).toContain('<li data-note="">note of b</li>');
	expect(chunks.map((chunk) => chunk.html).join('')).not.toContain('data-note-pending');
});

test('a nested @try reading two values, one chained on the other, streams both', async () => {
	const page = await compiledPage(`
import { computed } from '@markless/core';
${LATER}
function Pair({ id }) @{
	const first = computed(async () => later(id + ' first', 5));
	const second = computed(async () => later(first + ' then second', 40));

	@try {
		<li data-pair>{first} / {second}</li>
	} @pending {
		<li data-pair-pending>loading</li>
	}
}

export function Shelf() @{
	const list = computed(async () => later(['a'], 30));

	<main>
		@try {
			<ul>@for (const id of list; key id) { <Pair id={id} /> }</ul>
		} @pending {
			<p>pending list</p>
		}
	</main>
}
`);
	const stream = await renderToStream(page as never, {});
	const settled = await drainWithin(stream.appends(), 2_000);
	expect(settled).toContain('<li data-pair="">a first / a first then second</li>');
	expect(settled).not.toContain('data-pair-pending');
});

test("a nested value that fails streams the nested @catch with the arm", async () => {
	const page = await compiledPage(`
import { computed } from '@markless/core';
${LATER}
function Note({ id }) @{
	const note = computed(async () => {
		await later(null, 5);
		throw new Error('no note for ' + id);
	});

	@try {
		<li data-note>{note}</li>
	} @pending {
		<li data-note-pending>loading</li>
	} @catch (error) {
		<li data-note-failed>{error.message}</li>
	}
}

export function Shelf() @{
	const list = computed(async () => later(['a'], 30));

	<main>
		@try {
			<ul>@for (const id of list; key id) { <Note id={id} /> }</ul>
		} @pending {
			<p>pending list</p>
		}
	</main>
}
`);
	const stream = await renderToStream(page as never, {});
	const settled = await drainWithin(stream.appends(), 2_000);
	expect(settled).toContain('<li data-note-failed="">no note for a</li>');
	expect(settled).not.toContain('data-note-pending');
});

// The rule for any value the server is still loading: the response stays open until it settles or the client leaves.
test('a nested value that never settles holds only its arm, and a cancel ends the stream', async () => {
	const page = await compiledPage(`
import { computed } from '@markless/core';
${LATER}
function Never() @{
	const note = computed(async () => new Promise(() => {}));

	@try {
		<li data-note>{note}</li>
	} @pending {
		<li data-note-pending>loading</li>
	}
}

export function Shelf() @{
	const a = computed(async () => later('A', 20));
	const b = computed(async () => later('B', 20));

	<main>
		@try {
			<p data-a>{a}</p>
		} @pending {
			<p>pending a</p>
		}
		@try {
			<section><p data-b>{b}</p><ul><Never /></ul></section>
		} @pending {
			<p>pending b</p>
		}
	</main>
}
`);
	const stream = await renderToStream(page as never, {});
	setTimeout(() => stream.cancel('client left'), 300);
	const chunks = await timedChunks(stream.appends(), 2_000);
	const html = chunks.map((chunk) => chunk.html).join('');
	expect(html).toContain('<p data-a="">A</p>');
	expect(html).not.toContain('<p data-b');
});

// A hand-written render: arm 0 holds a nested boundary, arm 1 is a plain sibling; both settle together.
function nestedRender(inner: { readonly runner?: string; readonly settles: boolean }) {
	let renders = 0;
	const renderable = {
		async renderSsr(_props?: unknown, renderContext?: unknown) {
			renders++;
			const outer = await marklessSsrRunAsyncComputed(
				[] as never,
				'computed:outer',
				() => new Promise((resolve) => setTimeout(() => resolve('outer'), 30)),
				renderContext,
				true,
			);
			const sibling = await marklessSsrRunAsyncComputed(
				[] as never,
				'computed:sibling',
				() => new Promise((resolve) => setTimeout(() => resolve('sibling'), 30)),
				renderContext,
				true,
			);
			const ready = (snapshot: unknown) => (snapshot as { status?: string } | undefined)?.status === 'fulfilled';
			const outerReady = ready(outer);
			const siblingReady = ready(sibling);
			// The inner run settles at once, yet this render keeps reporting the inner boundary pending.
			if (outerReady && inner.runner && inner.settles)
				await marklessSsrRunAsyncComputed([] as never, inner.runner, async () => 'inner', renderContext, true);
			const innerHtml = '<!--markless:async:inner:0--><i>inner pending</i><!--/markless:async:inner:0-->';
			const outerArm = outerReady ? `<b>outer</b>${innerHtml}` : '<p>pending outer</p>';
			const siblingArm = siblingReady ? '<b>sibling</b>' : '<p>pending sibling</p>';
			const boundary = (id: string, runner: string, settled: boolean) => ({
				id,
				runnerGraphNodeId: runner,
				initiallyServedArm: settled ? ASYNC_BOUNDARY_ARM.try : ASYNC_BOUNDARY_ARM.pending,
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				asyncReads: [],
				armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
			});
			const snapshot = (graphNodeId: string, settled: boolean) => ({
				graphNodeId,
				name: graphNodeId,
				async: true,
				dependencies: [],
				snapshot: settled
					? { status: 'fulfilled', version: 1, key: { version: 1, root: null, records: [] }, value: { version: 1, root: 'x', records: [] } }
					: { status: 'pending', version: 1, key: { version: 1, root: null, records: [] } },
			});
			return {
				html: `<main><!--markless:async:boundary:0-->${outerArm}<!--/markless:async:boundary:0--><!--markless:async:boundary:1-->${siblingArm}<!--/markless:async:boundary:1--></main>`,
				structure: {
					anchors: [
						{ kind: 'async', id: 'boundary:0', html: outerArm, elementStart: 1, elementEnd: outerReady ? 3 : 2 },
						...(outerReady ? [{ kind: 'async', id: 'inner:0', html: '<i>inner pending</i>', elementStart: 2, elementEnd: 3 }] : []),
						{ kind: 'async', id: 'boundary:1', html: siblingArm, elementStart: outerReady ? 3 : 2, elementEnd: outerReady ? 4 : 3 },
					],
				},
				state: {
					version: ASYNC_PROTOCOL_VERSION,
					cells: [],
					computed: [snapshot('computed:outer', outerReady), snapshot('computed:sibling', siblingReady)],
				},
				view: {
					version: ASYNC_PROTOCOL_VERSION,
					locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						boundary('boundary:0', 'computed:outer', outerReady),
						...(outerReady ? [{ ...boundary('inner:0', inner.runner ?? '', false), runnerGraphNodeId: inner.runner }] : []),
						boundary('boundary:1', 'computed:sibling', siblingReady),
					],
				},
			} as never;
		},
	};
	return { renderable, renders: () => renders };
}

test('a nested boundary whose value settled but still renders @pending fails the stream once every other arm has streamed', async () => {
	const { renderable, renders } = nestedRender({ runner: 'computed:inner', settles: true });
	const stream = await renderToStream(renderable as never, {});
	const chunks: string[] = [];
	const drained = (async () => {
		for await (const chunk of stream.appends()) chunks.push(chunk);
	})();
	await expect(drained).rejects.toThrow(/MARKLESS_STREAM_ARM_RENDER_MISSING.*inner:0/);
	expect(chunks.join(''), 'the sibling reached the page before the failure').toContain('<b>sibling</b>');
	expect(chunks.join('')).not.toContain('<b>outer</b>');
	expect(renders()).toBeLessThan(10);
});

test('a nested boundary with no value the server is loading fails the stream instead of staying on @pending', async () => {
	const { renderable } = nestedRender({ settles: false });
	const stream = await renderToStream(renderable as never, {});
	await expect(drainWithin(stream.appends(), 2_000)).rejects.toThrow(/MARKLESS_STREAM_ARM_RENDER_MISSING.*inner:0/);
});
