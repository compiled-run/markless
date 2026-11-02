import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const source = (instances: ReadonlyArray<string>) => `import { state } from '@markless/core';

function Choice({ to, framed }: { readonly to: string; readonly framed: boolean }) @{
	let got = state('');
	<span>
		@if (framed) {
			<button type="button" onClick={() => (got = to)}>{to}</button>
		} @else {
			<i>{got}</i>
		}
	</span>
}

export default function Page() @{
	<main>
		${instances.map((to) => `<Choice to="${to}" framed={true} />`).join('\n\t\t')}
	</main>
}`;

async function armEventSymbolIds(instances: ReadonlyArray<string>) {
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: source(instances),
		symbols: [],
	});
	return (compiled.protocolView.branches ?? []).flatMap((branch) =>
		(branch.armRecords ?? []).flatMap((arm) => arm.events.flatMap((event) => event.symbolIds)),
	);
}

// An arm record is shared by every instance, so it names a handler bound per instance by its own id; each composition binds it.
test('an arm handler two instances bind differently keeps its own symbol id', async () => {
	const ids = await armEventSymbolIds(['dark', 'light']);
	expect(ids).toHaveLength(1);
	expect(ids[0]).toMatch(/^symbol:/);
});

test('an arm handler with one instance binding names that binding', async () => {
	const ids = await armEventSymbolIds(['dark']);
	expect(ids).toHaveLength(1);
	expect(ids[0]).toMatch(/^bound:/);
});
