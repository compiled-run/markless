import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

const reads = [
	{ read: 'data.name', value: 'data', field: 'name' },
	{ read: 'data?.name', value: 'data', field: 'name' },
	{ read: 'data!.name', value: 'data', field: 'name' },
	{ read: 'ticket?.owner.handle', value: 'ticket', field: 'owner' },
	{ read: 'ticket!.owner!.handle', value: 'ticket', field: 'owner' },
];

for (const { read, value } of reads)
	test(`a @try whose only async read is {${read}} settles on that value`, async () => {
		const source = `
import { computed } from '@markless/core';

export default function Detail() @{
	const ${value} = computed(async (): Promise<{ name: string; owner: { handle: string } } | null> => ({ name: 'n', owner: { handle: 'h' } }));

	<section>
		@try {
			<p>{${read}}</p>
		} @pending {
			<p>loading</p>
		}
	</section>
}
`;
		const result = await compileTsrxModule({ filename: 'src/detail.tsrx', source, symbols: [] });
		const flagged = collectTsrxModuleDiagnostics(result)
			.filter((diagnostic) => diagnostic.severity !== 'info')
			.map((diagnostic) => diagnostic.code);
		expect(flagged).toEqual([]);
		expect(result.protocolView.asyncBoundaries.map((boundary) => boundary.runnerGraphNodeId)).toEqual([
			`computed:${value}`,
		]);
	});

test('an async value read through ?. or ! outside a @try still asks for one', async () => {
	const source = `
import { computed } from '@markless/core';

export default function Loose() @{
	const report = computed(async (): Promise<{ title: string } | null> => ({ title: 't' }));

	<section>
		<p>{report?.title}</p>
		<p>{report!.title}</p>
	</section>
}
`;
	const result = await compileTsrxModule({ filename: 'src/loose.tsrx', source, symbols: [] });
	expect(
		collectTsrxModuleDiagnostics(result)
			.filter((diagnostic) => diagnostic.severity === 'error')
			.map((diagnostic) => diagnostic.code),
	).toEqual(['MARKLESS_ASYNC_BOUNDARY_REQUIRED', 'MARKLESS_ASYNC_BOUNDARY_REQUIRED']);
});
