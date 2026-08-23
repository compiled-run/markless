import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A branch test the compiler cannot reduce to ONE graph read keeps its authored
// source, and that source may spell shared-instance locals (`group`, `item`)
// that appear nowhere in the component's markup. The SSR module builds its
// prelude from markup residue alone, so those names reached `selectBranchArm`
// unbound and the server threw `ReferenceError: group is not defined` while the
// browser - whose reader unions the same decision sources into its prelude -
// rendered the arm fine.
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

test('a branch test over two shared instances declares both locals in the SSR prelude', async () => {
	const compiled = await compile('src/radio.tsrx', twoInstanceBranch);
	const arm = callbackBody(
		ssrFunction(compiled.publicRenderModule.ssrModuleSource ?? '', 'marklessRenderSsrItem'),
		'selectBranchArm',
	);

	expect(arm).toContain('group.value === item.picked');
	expect(arm).toMatch(/const group = \{"value": marklessSsrReadPublicPath\(/);
	expect(arm).toMatch(/const item = \{"picked": marklessSsrReadPublicPath\(/);
});

// The emitted arm run for real: the defect was a ReferenceError at render, not a
// missing string, so the proof has to evaluate the callback the server calls.
test('the emitted branch arm decides from those locals instead of throwing', async () => {
	const compiled = await compile('src/radio.tsrx', twoInstanceBranch);
	const arm = callbackBody(
		ssrFunction(compiled.publicRenderModule.ssrModuleSource ?? '', 'marklessRenderSsrItem'),
		'selectBranchArm',
	);
	const selectArm = new Function(
		'marklessSsrReadPublicPath',
		'marklessSsrRenderStateValues',
		'marklessSsrBranches',
		'marklessSsrDataSlot',
		'marklessSsrDataContext',
		arm,
	) as (
		read: (value: unknown, path: ReadonlyArray<string>) => unknown,
		values: { get: (id: string) => unknown },
		branches: Array<unknown>,
		slot: { branchSiteId: string },
		context: { asyncError: undefined },
	) => number;
	const read = (value: unknown, path: ReadonlyArray<string>) =>
		path.reduce<unknown>(
			(carrier, key) => (carrier as Record<string, unknown> | undefined)?.[key],
			value,
		);
	const run = (cell: Record<string, string>) =>
		selectArm(read, { get: () => cell }, [], { branchSiteId: 'branch-site:0' }, {
			asyncError: undefined,
		});

	expect(run({ value: 'a', picked: 'a' })).toBe(0);
	expect(run({ value: 'a', picked: 'b' })).toBe(1);
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
