import { expect, test } from 'vitest';
import type { CaptureSlotRoute, CompileTsrxModuleResult } from '../src/artifacts.ts';
import { compileTsrxModule } from '../src/compile-module.ts';
import { evaluateModuleConstants } from '../src/passes/semantic-graph/constant-values.ts';

const groupSource = `
import { state } from '@markless/core';
export function Group({ group }) @{
	let open = state(false);
	<button aria-expanded={open ? 'true' : 'false'} onClick={() => (open = !open)}>{group.title}</button>
}
`;

async function compileParent(
	source: string,
	importedModuleConstants?: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Promise<CompileTsrxModuleResult> {
	const child = await compileTsrxModule({
		filename: 'src/Group.tsrx',
		source: groupSource,
		symbols: [],
	});
	const titleUpdate = child.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'dom-update' && symbol.source === 'group.title',
	)!;
	return compileTsrxModule({
		filename: 'src/Sidebar.tsrx',
		source,
		symbols: [
			{
				id: 'imported:Group:symbol:title',
				chunk: 'virtual:markless:symbol:Group:title',
				exportName: 'groupTitle',
				componentEdgeId: 'component-edge:0',
				captureSymbol: titleUpdate,
			},
		],
		...(importedModuleConstants ? { importedModuleConstants } : {}),
	});
}

function opaqueDiagnostics(result: CompileTsrxModuleResult) {
	return result.captureAnalysis.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_CAPTURE_OPAQUE_PROP',
	);
}

function titleRoutes(result: CompileTsrxModuleResult): ReadonlyArray<CaptureSlotRoute> {
	return result.captureAnalysis.extractedSymbols.flatMap((symbol) =>
		symbol.captureSlots.flatMap((slot) => (slot.source === 'group.title' ? slot.routes : [])),
	);
}

const importedGroupsParent = `
import { Group } from './Group.tsrx';
import { GROUPS } from './groups.ts';

export function Sidebar() @{
	<Group group={GROUPS[0]} />
}
`;

test('an imported constant prop names the module the bundler must evaluate', async () => {
	const parent = await compileParent(importedGroupsParent);
	const prop = parent.semanticGraph.componentEdges[0]?.props.find(
		(item) => item.name === 'group',
	);

	expect(prop).toMatchObject({
		kind: 'opaque',
		importedConstants: [{ source: './groups.ts', exportName: 'GROUPS' }],
		fixedValue: true,
	});
	// Until the bundler hands it the value, the child's update reads the copy its own props hold.
	expect(opaqueDiagnostics(parent)).toEqual([]);
});

test('an imported constant prop reaches browser code as the fields it reads', async () => {
	const constants = evaluateModuleConstants({
		filename: 'src/groups.ts',
		source: `
export interface Group { id: string; title: string; items: readonly string[] }
const DOCS = { id: 'docs', title: 'Docs', items: ['a', 'b'] } satisfies Group;
export const GROUPS: readonly Group[] = [DOCS, { id: 'api', title: 'API', items: [] }] as const;
export const LOADED_AT = Date.now();
export function findGroup(id: string) { return GROUPS.find((group) => group.id === id); }
`,
	});
	expect(Object.keys(constants)).toEqual(['GROUPS']);

	const parent = await compileParent(importedGroupsParent, { './groups.ts': constants });

	expect(opaqueDiagnostics(parent)).toEqual([]);
	expect(titleRoutes(parent)).toEqual([
		expect.objectContaining({ kind: 'compiler-known-constant', value: { title: 'Docs' } }),
	]);
});

test('a same-file constant prop and a static index into it route as constants', async () => {
	const parent = await compileParent(`
import { Group } from './Group.tsrx';

const SECTIONS = [
	{ title: 'Intro', body: 'unused in the browser' },
	{ title: 'Outro', body: 'unused in the browser' },
];

export function Sidebar() @{
	<Group group={SECTIONS[1]!} />
}
`);

	expect(opaqueDiagnostics(parent)).toEqual([]);
	expect(titleRoutes(parent)).toEqual([
		expect.objectContaining({ kind: 'compiler-known-constant', value: { title: 'Outro' } }),
	]);
});

test('runtime values and constants their module mutates are fixed at render, so the child keeps its own copy', async () => {
	const computed = await compileParent(`
import { Group } from './Group.tsrx';
import { loadGroups } from './groups.ts';

export function Sidebar() @{
	<Group group={loadGroups()[0]} />
}
`);
	const mutated = await compileParent(`
import { Group } from './Group.tsrx';

const SECTIONS = [{ title: 'Intro' }];
SECTIONS.push({ title: 'Late' });

export function Sidebar() @{
	<Group group={SECTIONS[0]} />
}
`);
	const importedMutated = evaluateModuleConstants({
		filename: 'src/groups.ts',
		source: `export const GROUPS = [{ title: 'Docs' }];\nGROUPS[0].title = 'Changed';\n`,
	});

	expect(importedMutated).toEqual({});
	for (const result of [computed, mutated]) {
		expect(result.semanticGraph.componentEdges[0]?.props[0]).toMatchObject({
			kind: 'opaque',
			fixedValue: true,
		});
		expect(opaqueDiagnostics(result)).toEqual([]);
	}
});

test('a runtime value over a prop the browser can change keeps the refusal, in plain words', async () => {
	const live = await compileParent(`
import { state } from '@markless/core';
import { Group } from './Group.tsrx';

function Panel({ groups }) @{
	<Group group={groups.find((group) => group.title !== '')} />
}

export function Sidebar() @{
	let groups = state([{ title: 'Docs' }]);
	<Panel groups={groups} />
}
`);
	const [opaque, ...rest] = opaqueDiagnostics(live);

	expect(rest).toEqual([]);
	expect(
		live.semanticGraph.componentEdges.find((edge) => edge.childComponentName === 'Group')
			?.props[0],
	).not.toHaveProperty('fixedValue');
	expect(opaque?.message).toBe(
		'"Group" reads its prop "group" as `group.title` in a DOM update, which runs in the browser, but this <Group> passes `groups.find((group) => group.title !== \'\')`: code that runs only while the page renders, with no way for the browser to get its value.',
	);
	expect(opaque?.suggestions?.[0]?.message).toContain('hold the value in state()');
});

// A keyed row's item is data the row was rendered from, and a changed item
// rebuilds the row, so a DOM update reading it never needs it live. A handler
// reads the item of the row it fired in, and a value that is not the row's keeps the refusal.
test('a prop passed a keyed row value binds a DOM update, and a handler reads it from its row', async () => {
	const rowParent = (expression: string) =>
		compileParent(`
import { Group } from './Group.tsrx';

const SECTIONS = [{ id: 'intro', title: 'Intro' }, { id: 'outro', title: 'Outro' }];

export function Sidebar() @{
	<nav>
		@for (const section of SECTIONS; key section.id) {
			<Group group={${expression}} />
		}
	</nav>
}
`);

	expect(opaqueDiagnostics(await rowParent('section'))).toEqual([]);
	expect(opaqueDiagnostics(await rowParent('{ title: section.title }'))).toEqual([]);
	expect(opaqueDiagnostics(await rowParent('pick(section)'))).toHaveLength(1);

	const child = await compileTsrxModule({
		filename: 'src/Group.tsrx',
		source: `export function Group({ group }) @{
	<button onClick={() => console.log(group.title)}>{group.title}</button>
}`,
		symbols: [],
	});
	const handler = child.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const handlerParent = await compileTsrxModule({
		filename: 'src/Sidebar.tsrx',
		source: `
import { Group } from './Group.tsrx';
const SECTIONS = [{ id: 'intro', title: 'Intro' }];
export function Sidebar() @{
	<nav>
		@for (const section of SECTIONS; key section.id) {
			<Group group={section} />
		}
	</nav>
}
`,
		symbols: [
			{
				id: 'imported:Group:symbol:click',
				chunk: 'virtual:markless:symbol:Group:click',
				exportName: 'groupClick',
				componentEdgeId: 'component-edge:0',
				captureSymbol: handler,
			},
		],
	});
	expect(opaqueDiagnostics(handlerParent)).toEqual([]);
	expect(
		handlerParent.captureAnalysis.extractedSymbols.flatMap((symbol) =>
			symbol.captureSlots.flatMap((slot) => slot.routes.map((route) => route.kind)),
		),
	).toContain('row-local');
});
