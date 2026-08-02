import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Client-side route swaps mount pages through renderCsr. Lazy symbol modules
// (async computed runners, event handlers) read captured page props through
// the runtime graph as `prop:props` — during initial server render those reads
// resolve from closure scope, and the browser resume path never re-runs a
// props-only computed, so the missing cell stayed hidden until CSR mounts
// demanded the runner (dashboard-migration need 14 on the CSR path). The
// emitted CSR module must seed the prop cell from its props argument.

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

test('CSR module seeds the prop:props cell from the renderCsr props argument', async () => {
	const result = await compilePage('{ params }');
	const csrModule = result.publicRenderModule.csrModuleSource;

	expect(csrModule).toContain('propCellId:"prop:props"');
});

test('CSR module seeds an identifier-parameter page under its prop:<name> cell', async () => {
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

	expect(result.publicRenderModule.csrModuleSource).toContain('propCellId:"prop:pageProps"');
});

test('pages without props emit no prop cell seeding', async () => {
	const result = await compilePage('');

	expect(result.publicRenderModule.csrModuleSource).not.toContain(
		'marklessCsrPayloadState.cells.push',
	);
});

test('prop-dependent computeds emit the composed graph remap hook in CSR and SSR', async () => {
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

	expect(result.publicRenderModule.csrModuleSource).toContain(
		'"name":"input","kind":"graph-reference","graphNodeId":"computed:parentValue","path":[]',
	);
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'm(graphProps) { marklessSsrRemapGraphOutput(this, graphProps); }',
	);
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'marklessSsrRemapGraphOutput(marklessSsrOutput, [{"name":"input","graphNodeId":"computed:parentValue","path":[]}]);',
	);
});

test('capture routes hand parent state through same-named child prop metadata in CSR and SSR', async () => {
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
	const csrGraphProps =
		'{"name":"libraryOpen","kind":"graph-reference","graphNodeId":"state:libraryOpen","path":[],"source":"libraryOpen"}';
	const ssrGraphProps =
		'graphProps: [{"name":"libraryOpen","graphNodeId":"state:libraryOpen","path":[]}]';

	expect(result.publicRenderModule.csrModuleSource).toContain(csrGraphProps);
	expect(result.publicRenderModule.ssrModuleSource).toContain(ssrGraphProps);
});

test('components without prop-dependent computeds do not import the graph remapper', async () => {
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

	expect(result.publicRenderModule.csrModuleSource).not.toContain(
		'marklessCsrRemapGraphOutput',
	);
	expect(result.publicRenderModule.ssrModuleSource).not.toContain(
		'marklessSsrRemapGraphOutput',
	);
});
