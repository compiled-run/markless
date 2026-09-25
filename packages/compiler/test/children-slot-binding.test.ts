import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function childrenSlot(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Frame.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
	const root = result.renderData.chunks.find((chunk) => chunk.componentName === 'Frame');
	return root?.slots.find((slot) => slot.kind === 'text');
}

test('a children prop bound to another local name still renders raw', async () => {
	const slot = await childrenSlot(`import type { Children } from '@markless/core';

export default function Frame({ children: body }: { readonly children?: Children }) @{
	<section>{body}</section>
}
`);

	expect(slot).toMatchObject({
		kind: 'text',
		raw: true,
		residue: { kind: 'graph-read', path: ['children'] },
	});
});

test('a local that is not the children prop stays escaped text', async () => {
	const slot = await childrenSlot(`export default function Frame({ label }: { readonly label: string }) @{
	<section>{label}</section>
}
`);

	expect(slot).toMatchObject({ kind: 'text' });
	expect(slot).not.toHaveProperty('raw');
});
