import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// An @if decided by an expression of props is the caller's to flip, exactly like one decided by a bare prop.
const UNSUPPORTED = 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED';

async function compile(test: string, arm: string, extra = '') {
	const compiled = await compileTsrxModule({
		filename: 'src/Range.tsrx',
		source: `import { state } from '@markless/core';
const label = (route: string) => route + '!';
${extra}
export default function Range({ route, from, to }: { readonly route: string; readonly from: number; readonly to: number }) @{
	<section>@if (${test}) { ${arm} }</section>
}
`,
		symbols: [],
	});
	return {
		compiled,
		diagnostics: collectTsrxModuleDiagnostics(compiled).filter(
			(entry) => entry.code === UNSUPPORTED,
		),
		armAttributes: compiled.renderData.chunks
			.filter((chunk) => chunk.id.startsWith('branch:'))
			.flatMap((chunk) =>
				chunk.slots.flatMap((slot) => (slot.kind === 'attribute' ? [slot.residue] : [])),
			),
	};
}

test.each(['from', 'from <= 0', '(from ?? 0) <= 1 && 1 < (to ?? 3)'])(
	'an arm with a computed attribute under @if (%s) rebuilds from graph reads',
	async (condition) => {
		const { diagnostics, armAttributes } = await compile(
			condition,
			'<div id={label(route)} title={route.toUpperCase()}>{label(route)}</div>',
		);
		expect(diagnostics).toEqual([]);
		expect(armAttributes.map((residue) => residue.kind)).toEqual(['graph-read', 'graph-read']);
	},
);

test('a plain prop attribute keeps its own prop read', async () => {
	const { armAttributes } = await compile('from <= 0', '<div id={route}>x</div>');
	expect(armAttributes).toEqual([
		{ kind: 'graph-read', graphNodeId: 'prop:props', path: ['route'] },
	]);
});

test('an arm a flip still cannot rebuild warns, not errors, when an expression of props decides it', async () => {
	const keeper = `function Keeper() @{
	let hits = state(0);
	<button onClick={() => hits++}>{hits}</button>
}`;
	const { diagnostics } = await compile('from <= 0', '<Keeper />', keeper);
	expect(diagnostics.map((entry) => entry.severity)).toEqual(['warning']);
});

test('an arm decided by state still refuses as an error', async () => {
	const keeper = `function Keeper() @{
	let hits = state(0);
	<button onClick={() => hits++}>{hits}</button>
}`;
	const compiled = await compileTsrxModule({
		filename: 'src/Owned.tsrx',
		source: `import { state } from '@markless/core';
${keeper}
export default function Owned() @{
	let open = state(true);
	<section>
		<button onClick={() => (open = !open)}>toggle</button>
		@if (open) { <Keeper /> }
	</section>
}
`,
		symbols: [],
	});
	expect(
		collectTsrxModuleDiagnostics(compiled)
			.filter((entry) => entry.code === UNSUPPORTED)
			.map((entry) => entry.severity),
	).toEqual(['error']);
});
