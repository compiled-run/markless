export type ParseCacheFixture = {
	readonly name: string;
	readonly filename: string;
	readonly source: string;
};

/** Compiles clean; broad enough that every pass that asks for the module tree runs. */
export const COMPILING_FIXTURES: ReadonlyArray<ParseCacheFixture> = [
	{
		name: 'state-handlers-and-computed',
		filename: 'src/ParseCacheState.tsrx',
		source: `import { computed, state } from '@markless/core';
export function App() @{
	let count = state(0);
	const doubled = computed(() => count * 2);
	const attrs = { id: 'row' };
	<main {...attrs}><button onClick={(event) => { event.preventDefault(); count++; }}>{count}</button><output>{doubled}</output></main>
}
`,
	},
	{
		name: 'repeat-branch-and-boundary',
		filename: 'src/ParseCacheMarkup.tsrx',
		source: `import { computed, state } from '@markless/core';
export function App() @{
	let entries = state([{ code: 'a', title: 'Alpha' }]);
	let open = state(true);
	const details = computed(async () => ({ title: 'Ada' }));
	<section>
		@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }
		@for (const entry of entries; key entry.code) { <article><h2>{entry.title}</h2></article> }
		@try { <p>{details.title}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</section>
}
`,
	},
	{
		name: 'element-handle-and-behavior',
		filename: 'src/ParseCacheBehavior.tsrx',
		source: `import { element, state } from '@markless/core';
const install = (label) => (host) => { host.dataset.label = label; };
export function App() @{
	const label = state('ready');
	const box = element();
	<section el={box} attach={install(label)}>{label}</section>
}
`,
	},
	{
		name: 'same-module-child',
		filename: 'src/ParseCacheChild.tsrx',
		source: `import { state } from '@markless/core';
function Badge({ active }) @{ <span>@if (active) { <em>Live</em> } @else { <em>Idle</em> }</span> }
export function App() @{ let active = state(true); <main><Badge active={active} /></main> }
`,
	},
];

/**
 * The four sites that used to rewrite `node.type` on the shared tree once the
 * refusal was reported. Each must report the same way on every compile of the
 * same source.
 */
export const TEMPLATE_AS_VALUE_FIXTURES: ReadonlyArray<ParseCacheFixture> = [
	{
		name: 'declaration-initializer',
		filename: 'src/ParseCacheRefusalDeclaration.tsrx',
		source: `export function App() @{ const held = <p>no</p>; <main>{held}</main> }`,
	},
	{
		name: 'state-initial-value',
		filename: 'src/ParseCacheRefusalState.tsrx',
		source: `import { state } from '@markless/core'; export function App() @{ let held = state(<p>no</p>); <main>x</main> }`,
	},
	{
		name: 'computed-body',
		filename: 'src/ParseCacheRefusalComputed.tsrx',
		source: `import { computed } from '@markless/core'; export function App() @{ const held = computed(() => <p>no</p>); <main>x</main> }`,
	},
	{
		name: 'collection-call-argument',
		filename: 'src/ParseCacheRefusalPush.tsrx',
		source: `import { state } from '@markless/core'; export function App() @{ let rows = state([]); <button onClick={() => rows.push(<p>no</p>)}>go</button> }`,
	},
];
