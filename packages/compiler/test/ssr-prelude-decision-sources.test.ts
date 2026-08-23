import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A branch test over more than one read used to reach `selectBranchArm` as
// authored text, spelling shared-instance locals (`group`, `item`) that appear
// nowhere in the component's markup; the server threw `ReferenceError: group is
// not defined` while the browser rendered the arm fine, and the fix declared
// those locals in the SSR prelude.
//
// That path is superseded, not deleted. A recombined condition is now lifted to
// ONE synthetic computed at the semantic-graph level - the same mint the
// attribute and prop positions use - so the arm reads a graph node by id and the
// authored text survives only inside the derive the module seeds that node from.
// These tests pin the current emission: the arm reads the node, the module seeds
// it, and the two together decide the same way the author wrote.
const twoInstanceBranch = `
import { shared, state } from '@markless/core';

export const groupState = shared(() => {
	const cell = state({ value: 'a' });

	return { ...cell };
}, { scope: 'widget' });

export const itemState = shared(() => {
	const cell = state({ picked: 'b' });

	return { ...cell };
}, { scope: 'widget' });

export default function Group() @{
	const group = groupState();

	<div data-group data-value={group.value}><Item /></div>
}

export function Item() @{
	const group = groupState();
	const item = itemState();

	<span data-item>
		@if (group.value === item.picked) {
			<b data-picked>on</b>
		}
	</span>
}
`;

// The same shape where the part's test IS one graph read: the arm reads the
// state map directly, so this component owes no decision source and the union
// has to leave its prelude alone. The part still holds a shared instance, so a
// union that declared indiscriminately would show up here.
const singleReadBranch = `
import { shared, state } from '@markless/core';

export const flagState = shared(() => {
	const cell = state({ open: true });

	return { ...cell };
}, { scope: 'widget' });

export default function Panel() @{
	const panel = flagState();

	<div data-panel data-open={panel.open}><Body /></div>
}

export function Body() @{
	const panel = flagState();
	let lit = state(true);

	<section data-body data-mode={panel.open}>
		@if (lit) {
			<i data-lit>lit</i>
		}
	</section>
}
`;

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'b',
		resolverId: 'r',
		symbols: [],
	});
}

/** One emitted SSR render function, from its `async function` to its closing brace. */
function ssrFunction(source: string, functionName: string): string {
	const start = source.indexOf(`async function ${functionName}(`);
	if (start < 0) throw new Error(`no emitted SSR function ${functionName}`);
	const end = source.indexOf('\n}', start);
	return source.slice(start, end + 2);
}

/** The body of one `renderSsrData` callback, brace-matched from its arrow. */
function callbackBody(source: string, key: string): string {
	const marker = source.indexOf(`${key}:`);
	if (marker < 0) throw new Error(`no ${key} callback`);
	const open = source.indexOf('{', source.indexOf('=>', marker));
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		const character = source[index];
		if (character === '{') depth += 1;
		else if (character === '}') {
			depth -= 1;
			if (depth === 0) return source.slice(open + 1, index);
		}
	}
	throw new Error(`unterminated ${key} callback`);
}

/** The one emitted line that seeds `graphNodeId` into the SSR state map. */
function seedLine(source: string, graphNodeId: string): string {
	const line = source
		.split('\n')
		.find((candidate) =>
			candidate.includes(`marklessSsrRenderStateValues.set(${JSON.stringify(graphNodeId)},`),
		);
	if (!line) throw new Error(`no emitted seed for ${graphNodeId}`);
	return line.trim();
}

const GROUP_CELL = 'shared:src/radio.tsrx#groupState/state:cell';
const ITEM_CELL = 'shared:src/radio.tsrx#itemState/state:cell';

test('a branch test over two shared instances is decided by one seeded computed', async () => {
	const compiled = await compile('src/radio.tsrx', twoInstanceBranch);
	const item = ssrFunction(
		compiled.publicRenderModule.ssrModuleSource ?? '',
		'marklessRenderSsrItem',
	);
	const arm = callbackBody(item, 'selectBranchArm');

	// The arm names a graph node, not two locals it would have to have in scope.
	expect(arm).toContain(
		'marklessSsrReadPublicPath(marklessSsrRenderStateValues.get("computed:templateExpression:0"),[])',
	);
	expect(arm).not.toContain('const group =');
	expect(arm).not.toContain('const item =');

	// The module seeds that node before the render, from both shared instances,
	// and the authored condition is what the seed derives.
	const seed = seedLine(item, 'computed:templateExpression:0');
	expect(seed).toContain(`read(${JSON.stringify(GROUP_CELL)},[])`);
	expect(seed).toContain(`read(${JSON.stringify(ITEM_CELL)},[])`);
	expect(seed).toContain('group.value === item.picked');
});

// The emitted lines run for real: the defect was a wrong arm at render (an
// unseeded read is `undefined`, so the server took the else arm whenever the
// author's condition was true), not a missing string. The proof therefore
// evaluates the seed and the callback the server actually calls, together.
test('the emitted seed and arm decide the same way the author wrote', async () => {
	const compiled = await compile('src/radio.tsrx', twoInstanceBranch);
	const item = ssrFunction(
		compiled.publicRenderModule.ssrModuleSource ?? '',
		'marklessRenderSsrItem',
	);
	const decide = new Function(
		'marklessSsrReadPublicPath',
		'marklessSsrRenderStateValues',
		'marklessSsrBranches',
		'marklessSsrDataSlot',
		'marklessSsrDataContext',
		`${seedLine(item, 'computed:templateExpression:0')}\n${callbackBody(item, 'selectBranchArm')}`,
	) as (
		read: (value: unknown, path: ReadonlyArray<string>) => unknown,
		values: Map<string, unknown>,
		branches: Array<unknown>,
		slot: { branchSiteId: string },
		context: { asyncError: undefined },
	) => number;
	const read = (value: unknown, path: ReadonlyArray<string>) =>
		path.reduce<unknown>(
			(carrier, key) => (carrier as Record<string, unknown> | undefined)?.[key],
			value,
		);
	const run = (value: string, picked: string) =>
		decide(
			read,
			new Map<string, unknown>([
				[GROUP_CELL, { value }],
				[ITEM_CELL, { picked }],
			]),
			[],
			{ branchSiteId: 'branch-site:0' },
			{ asyncError: undefined },
		);

	expect(run('a', 'a')).toBe(0);
	expect(run('a', 'b')).toBe(1);
});

// The union may not hand a prelude to a component that never needed one: a
// single-read branch answers from the state map, so its callback body has to
// stay byte-for-byte the `error` line and the switch it already emitted.
// The other half of `renderDecisionSources` - an OPAQUE child prop - carries no
// test here on purpose. `collectComponentProps` only reaches `kind: 'opaque'`
// for an expression that is neither a composite over graph reads (lifted to a
// computed) nor a read of an unrouted graph cell (refused with a diagnostic), so
// an opaque source cannot spell a shared instance and any such test would pass
// vacuously. The union carries those sources anyway, which costs nothing.
test('a single-read branch keeps the prelude it already had', async () => {
	const compiled = await compile('src/panel.tsrx', singleReadBranch);
	const body = ssrFunction(
		compiled.publicRenderModule.ssrModuleSource ?? '',
		'marklessRenderSsrBody',
	);

	expect(callbackBody(body, 'selectBranchArm')).toBe(
		'const error=marklessSsrDataContext.asyncError;' +
			'switch(marklessSsrDataSlot.branchSiteId){' +
			'case "branch-site:0":{' +
			'const arm=((marklessSsrReadPublicPath(marklessSsrRenderStateValues.get("state:lit"),[]))?0:1);' +
			'marklessSsrBranches.push({id:marklessSsrDataSlot.branchSiteId,takenArm:arm});return arm;}' +
			"default:throw new Error('MARKLESS_SSR_DATA_BRANCH_MISSING: '+marklessSsrDataSlot.branchSiteId);}",
	);
});
