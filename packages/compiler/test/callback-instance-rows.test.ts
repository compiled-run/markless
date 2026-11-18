import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const DEEP_CHAIN = `import { state } from '@markless/core';
function Press({ onPress }: { readonly onPress: () => void }) @{
	<button onClick={() => onPress()}>p</button>
}
function Leaf({ group, name }: { readonly group: string; readonly name: string }) @{
	const seen = state({ text: '' });
	<div>
		<Press onPress={() => (seen.text = group + name)} />
		<span>{seen.text}</span>
	</div>
}
function Group({ name }: { readonly name: string }) @{
	<section>
		<Leaf group={name} name="x" />
		<Leaf group={name} name="y" />
	</section>
}
export default function Page() @{
	<div>
		<Group name="a" />
		<Group name="b" />
	</div>
}
`;

// The route table resolves an instance path one edge at a time and keeps one row per inner edge, so the callback is named by its own instance's row.
test('a callback two components deep is invoked through the row of its own instance', async () => {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source: DEEP_CHAIN, symbols: [] });
	const rows = result.captureAnalysis.boundResolverRows ?? [];
	const callback = result.symbolResolver.symbols.find((symbol) => symbol.kind === 'callback-prop')!;
	const callbackRows = new Map(
		rows
			.filter((row) => row.baseSymbolId === callback.id)
			.map((row) => [row.instancePath, row.id] as const),
	);
	const handlerRows = rows.filter((row) =>
		row.captureSlots.some((slot) => slot.route.kind === 'callback-route'),
	);

	expect(callbackRows.size).toBe(4);
	expect(handlerRows).toHaveLength(4);
	for (const row of handlerRows) {
		const composerPath = row.instancePath!.slice(0, row.instancePath!.lastIndexOf('c'));
		const route = row.captureSlots.find((slot) => slot.route.kind === 'callback-route')!.route;
		expect(route).toMatchObject({ callbackSymbolId: callbackRows.get(composerPath) });
		expect(route).not.toHaveProperty('composerPath');
	}
});
