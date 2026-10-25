import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

async function seedCall(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Region.tsrx', source, symbols: [] });
	return /marklessSsrSeedPropCells\([^\n]*?(\[\{"graphNodeId"[^\n]*?\}\])\)/.exec(
		result.publicRenderModule.ssrModuleSource,
	)?.[1];
}

// The browser runs these bodies later and reads the prop off the payload, so the prop must be in it.
test.each([
	[
		'an attach body',
		`<div attach={() => void (seen = 'read ' + String(id))} onVisible={() => {}}><p>{seen}</p></div>`,
	],
	['an event handler', `<button onClick={() => (seen = 'read ' + id)}>{seen}</button>`],
])('SSR seeds the prop %s reads', async (_name, markup) => {
	const seeds = await seedCall(`
import { state } from '@markless/core';
export default function Region({ id, note }: { id: string; note: string }) @{
	let seen = state('nothing yet');
	${markup}
}
`);
	expect(seeds).toBeDefined();
	const cells = JSON.parse(seeds!) as Array<{ keys: string[]; scalarKeys?: string[]; rowKeys?: string[] }>;
	const keys = cells.flatMap((cell) => [...cell.keys, ...(cell.scalarKeys ?? []), ...(cell.rowKeys ?? [])]);
	expect(keys).toContain('id');
	expect(keys).not.toContain('note');
});
