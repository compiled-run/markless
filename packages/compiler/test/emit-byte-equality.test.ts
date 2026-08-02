import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
import type { CompileTsrxModuleResult, ModuleGraphInterfaceArtifact } from '../src/index.ts';

type Fixture = {
	readonly name: string;
	readonly filename: string;
	readonly source: string;
	readonly imports?: ReadonlyArray<Fixture>;
};

const fixtures: ReadonlyArray<Fixture> = [
	{
		name: 'state-and-handlers',
		filename: 'src/StateHandlers.tsrx',
		source: `import { state } from '@markless/core'; export function App() @{ let count = state(0); <button onClick={(event) => { event.preventDefault(); count++; }}>{count}</button> }`,
	},
	{
		name: 'keyed-repeat',
		filename: 'src/KeyedRepeat.tsrx',
		source: `import { state } from '@markless/core'; export function App() @{ let entries = state([{ code: 'a', title: 'Alpha' }]); let chosen = state('a'); <main><section>@for (const entry of entries; key entry.code) { <article class={chosen === entry.code ? 'picked' : 'plain'}><h2>{entry.title}</h2><button onClick={() => chosen = entry.code}>Choose</button></article> }</section></main> }`,
	},
	{
		name: 'positional-keyed-repeat',
		filename: 'src/PositionalRepeat.tsrx',
		source: `import { state } from '@markless/core'; export function App() @{ let records = state([{ label: 'Zero' }]); <ol>@for (const record of records; index slot; key slot) { <li>{record.label}</li> }</ol> }`,
	},
	{
		name: 'branches',
		filename: 'src/Branches.tsrx',
		source: `import { state } from '@markless/core'; export function App() @{ let open = state(true); <section>@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }</section> }`,
	},
	{
		name: 'async-boundary',
		filename: 'src/AsyncBoundary.tsrx',
		source: `import { computed, state } from '@markless/core'; export function App() @{ const query = state('Ada'); const details = computed(async () => ({ title: query })); <main>@try { <p>{details.title}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }</main> }`,
	},
	{
		name: 'sync-computed',
		filename: 'src/SyncComputed.tsrx',
		source: `import { computed, state } from '@markless/core'; export function App() @{ const count = state(2); const doubled = computed(() => count * 2); <output>{doubled}</output> }`,
	},
	{
		name: 'behavior-and-element-handle',
		filename: 'src/BehaviorElement.tsrx',
		source: `import { element, state } from '@markless/core'; const install = (label) => (host) => { host.dataset.label = label; }; export function App() @{ const label = state('ready'); const box = element(); <section el={box} attach={install(label)}>{label}</section> }`,
	},
	{
		name: 'same-module-child',
		filename: 'src/SameModuleChild.tsrx',
		source: `import { state } from '@markless/core'; function Badge({ active }) @{ <span>@if (active) { <em>Live</em> } @else { <em>Idle</em> }</span> } export function App() @{ let active = state(true); <main><Badge active={active} /></main> }`,
	},
	{
		name: 'imported-child',
		filename: 'src/ImportedParent.tsrx',
		source: `import { state } from '@markless/core'; import { Child } from './ImportedChild.tsrx'; export function App() @{ let active = state(true); <main><Child active={active} /></main> }`,
		imports: [
			{
				name: 'imported-child-dependency',
				filename: 'src/ImportedChild.tsrx',
				source: `export function Child({ active }) @{ <span>@if (active) { <em>Live</em> } @else { <em>Idle</em> }</span> }`,
			},
		],
	},
	{
		name: 'spread-attributes',
		filename: 'src/SpreadAttributes.tsrx',
		source: `export function App() @{ const meta = { 'data-kind': 'card', title: 'Draft' }; <section {...meta} title="Final">Hi</section> }`,
	},
	{
		name: 'guard-clauses',
		filename: 'src/GuardClauses.tsrx',
		source: `import { state } from '@markless/core'; export function App() @{ let count = state(0); <button onClick={() => { if (count > 2) return; count++; }}>{count}</button> }`,
	},
	{
		name: 'module-scope-constants',
		filename: 'src/ModuleScopeConstants.tsrx',
		source: `const labels = { title: 'Hello', mode: 'compact' }; export function App() @{ <section data-mode={labels.mode}>{labels.title}</section> }`,
	},
	{
		name: 'helper-created-state',
		filename: 'src/HelperState.tsrx',
		source: `import { state } from '@markless/core'; function createCount() { const count = state(5); return count; } export function App() @{ const count = createCount(); <button onClick={() => count++}>{count}</button> }`,
	},
];

test('compileTsrxModule emitted artifacts stay byte-equal across public-render plan splits', async () => {
	const snapshots: Record<string, Record<string, string>> = {};

	for (const fixture of fixtures) {
		const importedModuleInterfaces: Record<string, ModuleGraphInterfaceArtifact> = {};
		for (const imported of fixture.imports ?? []) {
			const result = await compileFixture(imported, {});
			importedModuleInterfaces[`./${imported.filename.split('/').at(-1)}`] =
				result.moduleGraphInterface;
			snapshots[imported.name] = emittedSnapshot(result);
		}

		const result = await compileFixture(fixture, importedModuleInterfaces);
		snapshots[fixture.name] = emittedSnapshot(result);
	}

	expect(snapshots).toMatchSnapshot();
});

async function compileFixture(
	fixture: Fixture,
	importedModuleInterfaces: Record<string, ModuleGraphInterfaceArtifact>,
): Promise<CompileTsrxModuleResult> {
	return compileTsrxModule({
		filename: fixture.filename,
		source: fixture.source,
		symbols: [],
		importedModuleInterfaces,
	});
}

function emittedSnapshot(result: CompileTsrxModuleResult): Record<string, string> {
	return {
		renderDataModuleSource: result.publicRenderModule.renderDataModuleSource,
		csrModuleSource: result.publicRenderModule.csrModuleSource,
		ssrModuleSource: result.publicRenderModule.ssrModuleSource,
		symbolModules: result.symbolModules.modules
			.map((module) => `${module.symbolId}\n${module.source}`)
			.join('\n\n'),
		symbolResolverModule: result.symbolResolverModule,
		publicRenderPlan: stableJson(result.publicRenderPlan),
		protocolState: stableJson(result.protocolState),
		protocolView: stableJson(result.protocolView),
		payloadScripts: stableJson(result.payloadScripts),
	};
}

function stableJson(value: unknown): string {
	return JSON.stringify(value, null, 2);
}
