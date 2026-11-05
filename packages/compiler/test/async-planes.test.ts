import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A page loads async values and matched values as planes, only where its records say it serves them.
async function compile(body: string) {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { computed, state } from '@markless/core';\n\nexport function Page() @{\n${body}\n}\n`,
		symbols: [],
	});
	return {
		records: Object.fromEntries(
			result.protocolState.computed.map((record) => [record.graphNodeId, record]),
		),
		planes: result.moduleGraphInterface.asyncPlanes,
	};
}

test('an async value no reader pairs with an input of its key holds nothing', async () => {
	const { records, planes } = await compile(`
	let month = state('may');
	const statement = computed(async () => ({ title: 'Statement for ' + month }));
	<main>
		<button onClick={() => (month = 'june')}>June</button>
		@try {
			<h3>{statement.title}</h3>
		} @pending {
			<p>Loading</p>
		}
	</main>`);
	expect(records['computed:statement']).not.toHaveProperty('holds');
	expect(planes).toEqual({ async: true });
});

test('a reader beside an input of the key, or beside a value fetched with the same input, holds both values', async () => {
	const { records, planes } = await compile(`
	let range = state('10d');
	const revenue = computed(async () => ({ total: range === '10d' ? 1 : 2 }));
	const costs = computed(async () => ({ total: range === '10d' ? 3 : 4 }));
	const perDay = computed(() => revenue.total / (range === '10d' ? 10 : 20));
	const profit = computed(() => revenue.total - costs.total);
	<main>
		@try {
			<p>{perDay} {profit}</p>
		} @pending {
			<p>Loading</p>
		}
	</main>`);
	expect(records['computed:revenue']).toMatchObject({ holds: true });
	expect(records['computed:costs']).toMatchObject({ holds: true });
	expect(records['computed:perDay']).toMatchObject({ asyncFrom: ['computed:revenue'] });
	expect(records['computed:profit']).toMatchObject({
		asyncFrom: ['computed:revenue', 'computed:costs'],
	});
	expect(planes).toEqual({ async: true, held: true });
});

test('a module without async values names no plane, and its sync computeds carry no asyncFrom', async () => {
	const { records, planes } = await compile(`
	let count = state(1);
	const doubled = computed(() => count * 2);
	<button onClick={() => (count = count + 1)}>{doubled}</button>`);
	expect(records['computed:doubled']).not.toHaveProperty('asyncFrom');
	expect(planes).toBeUndefined();
});

test('a module composing a child that serves async values names the plane for it', async () => {
	const child = await compileTsrxModule({
		filename: 'src/Lookup.tsrx',
		source: `import { computed } from '@markless/core';

export function Lookup() @{
	const mug = computed(async () => ({ name: 'mug' }));
	@try {
		<b>{mug.name}</b>
	} @pending {
		<i>Loading</i>
	}
}
`,
		symbols: [],
	});
	const parent = await compileTsrxModule({
		filename: 'src/Shelf.tsrx',
		source: `import { Lookup } from './Lookup.tsrx';

export function Shelf() @{
	<section><Lookup /></section>
}
`,
		symbols: [],
		importedModuleInterfaces: { './Lookup.tsrx': child.moduleGraphInterface },
	});
	expect(child.moduleGraphInterface.asyncPlanes).toEqual({ async: true });
	expect(parent.moduleGraphInterface.asyncPlanes).toEqual({ async: true });
});
