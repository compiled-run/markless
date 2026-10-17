import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
}

test('a position-keyed @for ships a resumable record that keys rows by position', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Page() @{
	let crew = state([{ name: 'Ana' }, { name: 'Bo' }]);
	<ol>
		// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: slot state
		@for (const member of crew; index slot; key slot) {
			<li>{member.name}</li>
		}
	</ol>
}`);
	expect(result.protocolView.keyedRepeats).toEqual([
		expect.objectContaining({ collectionGraphNodeId: 'state:crew', indexKey: true }),
	]);
});

test('a data-keyed @for record carries no position marker', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Page() @{
	let crew = state([{ name: 'Ana' }, { name: 'Bo' }]);
	<ol>
		@for (const member of crew; key member.name) {
			<li>{member.name}</li>
		}
	</ol>
}`);
	expect(result.protocolView.keyedRepeats?.[0]).not.toHaveProperty('indexKey');
	expect(result.protocolView.keyedRepeats?.[0]).not.toHaveProperty('branchArm');
});

const sharedParentSource = `import { state } from '@markless/core';
export function Page() @{
	let crew = state([{ name: 'Ana' }]);
	let compact = state(false);
	<ul>
		@if (compact) {
			@for (const member of crew; key member.name) {
				<li>{member.name}</li>
			}
		} @else {
			@for (const member of crew; key member.name) {
				<li><b>{member.name}</b></li>
			} @empty {
				<li>Nobody</li>
			}
		}
	</ul>
	<button onClick={() => (compact = !compact)}>toggle</button>
}`;

test('rows written straight into a branch arm name the arm they belong to', async () => {
	const result = await compile(sharedParentSource);
	expect(result.protocolView.keyedRepeats?.map((repeat) => repeat.branchArm)).toEqual([
		{ branchId: 'branch-site:0', arm: 0 },
		{ branchId: 'branch-site:0', arm: 1 },
	]);
});

test('rows inside an element of their own in the arm name no branch arm', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Page() @{
	let crew = state([{ name: 'Ana' }]);
	let open = state(true);
	<div>
		@if (open) {
			<ul>
				@for (const member of crew; key member.name) {
					<li>{member.name}</li>
				}
			</ul>
		}
		<button onClick={() => (open = !open)}>toggle</button>
	</div>
}`);
	expect(result.protocolView.keyedRepeats?.[0]).not.toHaveProperty('branchArm');
});

test('a branch arm that rebuilds its rows shows the @empty block for an empty collection', async () => {
	const result = await compile(sharedParentSource);
	const branchModule = result.symbolModules.modules.find((module) =>
		module.source.includes('marklessBranchRows'),
	);
	expect(branchModule?.source).toContain('"empty": "<li>Nobody</li>"');
	expect(branchModule?.source).toContain('if (items.length === 0) return repeat.empty ?? "";');
});

test('rows written straight into an @try arm name the boundary arm they belong to', async () => {
	const result = await compile(`import { computed } from '@markless/core';
export function Page() @{
	const crates = computed(async () => [{ code: 'k1' }]);
	<section>
		@try {
			@for (const crate of crates; key crate.code) {
				<p>{crate.code}</p>
			}
		} @pending {
			<p>packing</p>
		}
		<footer>end</footer>
	</section>
}`);
	expect(result.protocolView.keyedRepeats?.[0]?.branchArm).toEqual({
		branchId: 'boundary:0',
		arm: 0,
	});
});

test('rows inside an element of their own in an @try arm name no boundary arm', async () => {
	const result = await compile(`import { computed } from '@markless/core';
export function Page() @{
	const crates = computed(async () => [{ code: 'k1' }]);
	<section>
		@try {
			<ul>
				@for (const crate of crates; key crate.code) {
					<li>{crate.code}</li>
				}
			</ul>
		} @pending {
			<p>packing</p>
		}
	</section>
}`);
	expect(result.protocolView.keyedRepeats?.[0]).not.toHaveProperty('branchArm');
});
