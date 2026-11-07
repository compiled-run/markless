import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { withBuildHash } from '../src/passes/protocol-state.ts';

const ASYNC = `import { computed, state } from '@markless/core';
export default function Quote() @{
	let id = state(1);
	const quote = computed(async () => ({ text: String(id) }));
	@try {
		<p>{quote.text}</p>
	} @pending {
		<p>Loading</p>
	}
}`;

async function buildHash(source: string): Promise<string | undefined> {
	const result = await compileTsrxModule({ filename: 'src/Quote.tsrx', source, symbols: [] });
	return (result.payloadScripts.state as { buildHash?: string }).buildHash;
}

test('a module serving an async value names its build; the same source names the same one', async () => {
	const first = await buildHash(ASYNC);
	expect(first).toMatch(/^[0-9a-z]+$/);
	expect(await buildHash(ASYNC)).toBe(first);
	expect(await buildHash(ASYNC.replace('Loading', 'Fetching'))).not.toBe(first);
});

test('a module without async values carries no build hash at all', async () => {
	expect(
		await buildHash(`import { state } from '@markless/core';
export default function Count() @{
	let count = state(0);
	<button onClick={() => count++}>{count}</button>
}`),
	).toBeUndefined();
});

test('a change in a linked component interface changes the build hash', () => {
	const state = {
		version: 1,
		cells: [],
		computed: [{ graphNodeId: 'computed:quote', name: 'quote', async: true }],
		sharedDefinitions: [],
	} as never;
	const one = withBuildHash(state, 'source', { './Card.tsrx': { exports: ['a'] } }).buildHash;
	expect(withBuildHash(state, 'source', { './Card.tsrx': { exports: ['a'] } }).buildHash).toBe(one);
	expect(withBuildHash(state, 'source', { './Card.tsrx': { exports: ['b'] } }).buildHash).not.toBe(one);
});
