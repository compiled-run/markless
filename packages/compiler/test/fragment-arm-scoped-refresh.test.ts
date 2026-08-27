/**
 * A fragment arm has text but no element of its own. Bound to the element
 * around the branch, its refresh set that element's text and erased both arms'
 * markers along with whatever the sibling arm had rendered. These pin the read
 * leaving the module's element-bound updates and arriving as a branch content
 * read instead, so the refresh replaces the arm's own marker range.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const source = `import { state } from '@markless/core';

export default function Page() @{
	let count = state(0);

	<div>
		@if (count > 0) {
			<>{count}</>
		} @else {
			<span>count is {count}</span>
		}
	</div>
}
`;

async function view() {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result.protocolView;
}

test('the fragment arm binds no update to the element around the branch', async () => {
	const payload = await view();

	expect(payload.domUpdates).toEqual([]);
	expect(payload.locators.map((locator) => locator.tagName)).toEqual(['div']);
});

test('the fragment arm read arrives as a branch content read', async () => {
	const [branch] = payload(await view());

	expect(branch.contentReads).toEqual([
		{ graphNodeId: 'state:count', path: [], source: 'count' },
	]);
	expect(branch.symbolId).toBeTruthy();
});

// The sibling arm owns an element, so its read stays element-bound and arm-scoped.
test('the element arm keeps its own host-bound update', async () => {
	const [branch] = payload(await view());

	expect(branch.armRecords?.[0]?.domUpdates ?? []).toEqual([]);
	expect(branch.armRecords?.[1]?.domUpdates).toMatchObject([
		{ hostNodeId: 'h1', target: { kind: 'text', prefix: 'count is ' } },
	]);
});

test('a module with no arm-scoped read carries no content reads', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Plain.tsrx',
		source: `import { state } from '@markless/core';

export default function Plain() @{
	let count = state(0);

	<div><span>{count}</span></div>
}
`,
		symbols: [],
	});

	expect(result.payloadArena.view).not.toHaveProperty('branchContentReads');
	expect(result.protocolView.domUpdates).toHaveLength(1);
});

function payload(viewPayload: Awaited<ReturnType<typeof view>>) {
	const branches = viewPayload.branches ?? [];
	expect(branches).toHaveLength(1);
	return branches;
}
