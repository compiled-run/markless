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
	});
	expect(opaqueDiagnostics(parent)).toHaveLength(1);
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

test('runtime values and constants their module mutates keep the refusal', async () => {
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
		const [opaque, ...rest] = opaqueDiagnostics(result);
		expect(rest).toEqual([]);
		expect(opaque?.message).toContain('"Group" reads it as `group.title` in a DOM update');
		expect(opaque?.why).toContain('Constant data reaches the browser as its build-time value');
		expect(opaque?.suggestions?.[0]?.message).toContain('Pass plain constant data');
	}
	expect(opaqueDiagnostics(computed)[0]?.message).toContain(
		'prop "group" for "Group" is the runtime expression "loadGroups()[0]"',
	);
});
