import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A resolved field named like a snapshot key must still read through the snapshot's value.
async function boundaryModule(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Dock.tsrx', source, symbols: [] });
	const module = result.symbolModules.modules.find(
		(candidate) => candidate.kind === 'async-boundary-update',
	);
	if (!module) throw new Error('Expected an async-boundary-update module.');
	const arms = /const marklessBoundaryArms = (.*);\n/.exec(module.source)?.[1];
	if (!arms) throw new Error('Expected the boundary arms literal.');
	return { source: module.source, arms: JSON.parse(arms) as unknown[][] };
}

function reads(parts: ReadonlyArray<unknown> = []): unknown[] {
	return parts.flatMap((part) => {
		const record = part as { read?: unknown; repeat?: { read: unknown } };
		return record.read ? [record.read] : record.repeat ? [record.repeat.read] : [];
	});
}

function dock(resolved: string, arm: string): string {
	return `import { computed, state } from '@markless/core';
export function Dock() @{
	let tide = state(0);
	const harbor = computed(async () => {
		const level = tide;
		await Promise.resolve();
		return ${resolved};
	});
	<div>
		<button onClick={() => tide++}>tide</button>
		@try {
			${arm}
		} @pending {
			<p>wait</p>
		}
	</div>
}
`;
}

test('boundary arm reads keep authored fields named like snapshot keys', async () => {
	const { arms } = await boundaryModule(
		dock(
			`{ error: 'e' + level, version: 'v2' }`,
			`<b>{harbor.error}</b>\n\t\t\t<i>{harbor.version}</i>`,
		),
	);
	expect(reads(arms[0])).toEqual([
		{ graphNodeId: 'computed:harbor', path: ['value', 'error'] },
		{ graphNodeId: 'computed:harbor', path: ['value', 'version'] },
	]);
});

test('a repeat inside a boundary arm reads its collection through the snapshot value and renders rows', async () => {
	const bare = await boundaryModule(
		dock(
			`[{ key: 'b' + level }]`,
			`<ol>@for (const berth of harbor; key berth.key) { <li>{berth.key}</li> }</ol>`,
		),
	);
	expect(reads(bare.arms[0])).toEqual([{ graphNodeId: 'computed:harbor', path: ['value'] }]);
	expect(bare.source).toContain('function marklessBranchRows(');

	const field = await boundaryModule(
		dock(
			`{ status: [{ key: 'h' + level }] }`,
			`<ol>@for (const slip of harbor.status; key slip.key) { <li>{slip.key}</li> }</ol>`,
		),
	);
	expect(reads(field.arms[0])).toEqual([
		{ graphNodeId: 'computed:harbor', path: ['value', 'status'] },
	]);
});
