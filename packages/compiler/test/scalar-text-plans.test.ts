import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

test.each([
	[
		'Counter',
		'count',
		'<button onClick={() => count++}>Clicked {count} times</button>',
		'Clicked ',
		' times',
	],
	[
		'Meter',
		'level',
		'<section><output>Level: {level} units</output><button onClick={() => level++}>Raise</button></section>',
		'Level: ',
		' units',
	],
])(
	'scalar text plans preserve both static text segments in %s',
	async (name, cell, body, prefix, suffix) => {
		const compiled = await compileTsrxModule({
			filename: `/src/${name}.tsrx`,
			buildId: 'scalar-text',
			resolverId: 'scalar-text',
			symbols: [],
			source: `import { state } from '@markless/core'; export default function ${name}() @{ let ${cell} = state(0); ${body} }`,
		});
		const plan = compiled.runtimeDemandMaps['plain-ssr'].actions[0]?.plan;
		expect(plan).toMatchObject({
			kind: 'scalar',
			cell: `state:${cell}`,
			textUpdates: [{ prefix, suffix }],
		});
		expect(compiled.runtimeDemandMaps.prerender.actions[0]?.plan).toBeUndefined();
	},
);

test.each([
	[
		'Order',
		'status',
		"'Brewing'",
		"() => (status = 'Ready')",
		{ kind: 'assign', value: 'Ready' },
	],
	['Lamp', 'lit', 'false', '() => ((lit = true))', { kind: 'assign', value: true }],
	['Gauge', 'level', '3', '() => {level=0}', { kind: 'assign', value: 0 }],
	['Dial', 'turns', '0', '() => (++turns)', { kind: 'update', updateOperator: '++' }],
	[
		'Tally',
		'marks',
		'9',
		'(event) => { event.preventDefault(); (marks --); }',
		{ kind: 'update', updateOperator: '--' },
	],
])(
	'a single write in %s gets a scalar plan however the handler parenthesizes or spaces it',
	async (name, cell, initial, handler, write) => {
		const compiled = await compileTsrxModule({
			filename: `/src/${name}.tsrx`,
			buildId: 'scalar-write-shape',
			resolverId: 'scalar-write-shape',
			symbols: [],
			source: `import { state } from '@markless/core'; export default function ${name}() @{ let ${cell} = state(${initial}); <section><p>Now: {${cell}}</p><button onClick={${handler}}>Go</button></section> }`,
		});
		expect(compiled.runtimeDemandMaps['plain-ssr'].actions[0]?.plan).toMatchObject({
			kind: 'scalar',
			cell: `state:${cell}`,
			write,
		});
	},
);

test.each([
	['a sequence carries a second expression', "() => (status = 'Ready', console.log(status))"],
	['the write is an operand of another expression', "() => void (status = 'Ready')"],
])('no scalar plan when %s', async (_reason, handler) => {
	const compiled = await compileTsrxModule({
		filename: '/src/Order.tsrx',
		buildId: 'scalar-write-shape',
		resolverId: 'scalar-write-shape',
		symbols: [],
		source: `import { state } from '@markless/core'; export default function Order() @{ let status = state('Brewing'); <section><p>{status}</p><button onClick={${handler}}>Go</button></section> }`,
	});
	expect(compiled.runtimeDemandMaps['plain-ssr'].actions[0]?.plan?.kind).not.toBe('scalar');
});

const rowSource = (handler: string, rowReads: string, extra = '') =>
	`import { state, computed } from '@markless/core'; export default function Picker() @{ let rows = state([{ id: 'x' }, { id: 'y' }]); let picked = state(''); ${extra} <main><output>{picked}</output><ul>@for (const row of rows; key row.id) { <li><button onClick={${handler}}>{row.id}</button>${rowReads}</li> }</ul></main> }`;

async function rowPlan(source: string) {
	const compiled = await compileTsrxModule({
		filename: '/src/Picker.tsrx',
		buildId: 'row-write-shape',
		resolverId: 'row-write-shape',
		symbols: [],
		source,
	});
	return compiled.runtimeDemandMaps['plain-ssr'].actions.find(
		(action) => action.recordKind === 'keyed-repeat-row',
	)?.plan;
}

test.each(['() => (picked = row.id)', '() => picked = row.id'])(
	'a row write %s only the outer text reads gets a row plan',
	async (handler) => {
		expect(await rowPlan(rowSource(handler, ''))).toMatchObject({
			kind: 'row',
			cell: 'state:picked',
			write: { kind: 'assign', localPath: ['row', 'id'] },
		});
	},
);

test.each([
	['a row attribute', '<i class={picked === row.id ? "on" : "off"}></i>', ''],
	['a row text', '<i>{picked === row.id ? "on" : "off"}</i>', ''],
	['a computed', '<i>{loud}</i>', 'const loud = computed(() => picked.toUpperCase());'],
])('no row plan when %s also reads the written cell', async (_reader, rowReads, extra) => {
	for (const handler of ['() => (picked = row.id)', '() => picked = row.id'])
		expect(await rowPlan(rowSource(handler, rowReads, extra))).toBeUndefined();
});
