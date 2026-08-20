import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Linked component definitions retain prop-cell and graph-route metadata for
// the prerender evaluator and lazy symbol modules without emitting a browser
// component renderer.

async function compilePage(params: string) {
	return await compileTsrxModule({
		filename: 'pages/repo.tsrx',
		source: `import { computed } from '@markless/core';
import { fetchView, pickRepo } from './lib.ts';

export default function RepoPage(${params}) @{
	const model = computed(async ({ signal }) => {
		const view = await fetchView(signal);
		return { repo: pickRepo(view, ${params ? 'params.repo' : '"fixed"'}) };
	});
	<div class="app-root">
		@try {
			<section><h1>{model.repo}</h1></section>
		} @pending { <p>Loading</p> } @catch { <p>Failed</p> }
	</div>
}`,
		symbols: [],
	});
}

test('linked definitions identify the prop:props cell', async () => {
	const result = await compilePage('{ params }');
	expect(result.publicRenderModule.componentDefinitions[0]?.propCellId).toBe('prop:props');
});

test('linked definitions identify an identifier-parameter prop cell', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/whole-props.tsrx',
		source: `import { computed } from '@markless/core';
import { fetchView } from './lib.ts';

export default function Page(pageProps) @{
	const model = computed(async ({ signal }) => ({ view: await fetchView(signal) }));
	<div class="app-root">
		@try { <p>{model.view}</p> } @pending { <p>Loading</p> } @catch { <p>Failed</p> }
	</div>
}`,
		symbols: [],
	});

	expect(result.publicRenderModule.componentDefinitions[0]?.propCellId).toBe('prop:pageProps');
});

test('pages without props publish no prop cell', async () => {
	const result = await compilePage('');
	expect(result.publicRenderModule.componentDefinitions[0]?.propCellId).toBeNull();
});

test('prop-dependent computeds publish linked graph metadata and the SSR remap hook', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/computed-prop-chain.tsrx',
		source: `import { computed, state } from '@markless/core';

function Child({ input }) @{
	const childValue = computed(() => input + 1);
	<output>{childValue}</output>
}

export default function Page() @{
	let owner = state(0);
	const parentValue = computed(() => owner);
	<main><Child input={parentValue} /></main>
}`,
		symbols: [],
	});

	expect(JSON.stringify(result.publicRenderModule.componentDefinitions)).toContain(
		'"name":"input","kind":"graph-reference","graphNodeId":"computed:parentValue","path":[]',
	);
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'm(graphProps, instancePath) { marklessSsrRemapGraphOutput(this, graphProps, instancePath); }',
	);
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'marklessSsrRemapGraphOutput(marklessSsrOutput, [{"name":"input","graphNodeId":"computed:parentValue","path":[]}]);',
	);
});

test('capture routes hand parent state through linked child prop metadata and SSR', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/state-prop-handoff.tsrx',
		source: `import { state } from '@markless/core';

function Library({ libraryOpen }) @{
	<aside class={libraryOpen ? 'library active' : 'library'}>Songs</aside>
}

export default function Page() @{
	let libraryOpen = state(false);
	<main><Library libraryOpen={libraryOpen} /></main>
}`,
		symbols: [],
	});
	const linkedGraphProps =
		'{"name":"libraryOpen","kind":"graph-reference","graphNodeId":"state:libraryOpen","path":[],"source":"libraryOpen"}';
	const ssrGraphProps =
		'"graphProps":[{"name":"libraryOpen","graphNodeId":"state:libraryOpen","path":[]}]';

	expect(JSON.stringify(result.publicRenderModule.componentDefinitions)).toContain(linkedGraphProps);
	expect(result.publicRenderModule.ssrModuleSource).toContain(ssrGraphProps);
});

test('components without prop-dependent computeds do not import the SSR graph remapper', async () => {
	const result = await compileTsrxModule({
		filename: 'pages/presentational-child.tsrx',
		source: `function Child({ input }) @{
	<output>{input}</output>
}

export default function Page({ input }) @{
	<main><Child input={input} /></main>
}`,
		symbols: [],
	});

	expect(result.publicRenderModule.ssrModuleSource).not.toContain(
		'marklessSsrRemapGraphOutput',
	);
});
