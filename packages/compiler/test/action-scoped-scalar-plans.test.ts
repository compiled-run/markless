import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function plainSsrMap(name: string, body: string, imports = '') {
	const compiled = await compileTsrxModule({
		filename: `/src/${name}.tsrx`,
		buildId: 'action-scoped',
		resolverId: 'action-scoped',
		symbols: [],
		source: `import { state, computed, element } from '@markless/core'; ${imports} export default function ${name}() @{ ${body} }`,
	});
	expect(compiled.protocolView.events.length).toBeGreaterThan(0);
	return compiled.runtimeDemandMaps['plain-ssr'];
}

function planFor(map: Awaited<ReturnType<typeof plainSsrMap>>, cell: string) {
	return map.actions.find((action) => action.plan?.cell === cell)?.plan;
}

function actionWriting(map: Awaited<ReturnType<typeof plainSsrMap>>, hostNodeId: string) {
	return map.actions.find((action) => action.hostNodeId === hostNodeId);
}

test.each([
	[
		'Panel',
		'let count = state(0); let open = state(false); <div><output>{count}</output><button onClick={() => count++}>Add</button><button onClick={() => (open = !open)}>Toggle</button>@if (open) { <p>Shown</p> }</div>',
		'state:count',
	],
	[
		'Drawer',
		'let expanded = state(true); let clicks = state(10); <section>@if (expanded) { <aside>Menu</aside> }<a onClick={() => (expanded = false)}>Hide</a><span>Clicks: {clicks}</span><i onClick={() => clicks--}>less</i></section>',
		'state:clicks',
	],
	[
		'Handles',
		'let total = state(1); const box = element(); <main><div el={box}>Box</div><b>{total}</b><button onClick={() => total++}>More</button></main>',
		'state:total',
	],
])(
	'an unrelated scalar action in %s is lean eligible beside page-wide full-resume records',
	async (name, body, cell) => {
		const map = await plainSsrMap(name, body);
		expect(planFor(map, cell)).toMatchObject({ kind: 'scalar', cell });
		expect(map.recordKinds.find((record) => record.kind === 'event')?.replaced).toBe(true);
		const planned = map.actions.filter((action) => action.plan);
		expect(planned).toHaveLength(1);
	},
);

test.each([
	[
		'branch test reads the cell',
		'let count = state(0); <div><output>{count}</output><button onClick={() => count++}>Add</button>@if (count) { <p>Some</p> }</div>',
	],
	[
		'a served branch arm renders the cell',
		'let count = state(0); let open = state(true); <div><output>{count}</output><button onClick={() => count++}>Add</button><button onClick={() => (open = !open)}>Toggle</button>@if (open) { <p>{count}</p> }</div>',
	],
	[
		'a computed depends on the cell',
		'let count = state(0); const doubled = computed(() => count * 2); <div><output>{count}</output><button onClick={() => count++}>Add</button><p>{doubled}</p></div>',
	],
	[
		'an element handle sits on the event host',
		'let count = state(0); const button = element(); <div><output>{count}</output><button el={button} onClick={() => count++}>Add</button></div>',
	],
	[
		'a behavior sits on the event host',
		'let count = state(0); <div><output>{count}</output><button attach={(host) => { host.dataset.ready = "yes"; }} onClick={() => count++}>Add</button></div>',
	],
	[
		'a child component receives the cell as a prop',
		'let count = state(0); <div><output>{count}</output><button onClick={() => count++}>Add</button><Child value={count} /></div>',
		"import Child from './child.tsrx';",
	],
	[
		'an attribute also renders the cell',
		'let count = state(0); <div><output data-count={count}>{count}</output><button onClick={() => count++}>Add</button></div>',
	],
])('refuses a scalar plan when %s', async (_reason, body, imports = '') => {
	const map = await plainSsrMap('Refused', body, imports);
	expect(planFor(map, 'state:count')).toBeUndefined();
});

test('an ineligible action on a lean-eligible page gets no plan of its own', async () => {
	const map = await plainSsrMap(
		'Mixed',
		'let count = state(0); let level = state(1); <div><output>{count}</output><button onClick={() => count++}>Add</button><output title={level}>{level}</output><button onClick={() => level++}>Raise</button></div>',
	);
	expect(planFor(map, 'state:count')).toMatchObject({ kind: 'scalar' });
	expect(planFor(map, 'state:level')).toBeUndefined();
});

test('refusing one action keeps the other actions of a branch page eligible', async () => {
	const map = await plainSsrMap(
		'Split',
		'let shown = state(0); let taps = state(0); <div><button onClick={() => shown++}>Show</button>@if (shown) { <p>On</p> }<em>{taps}</em><button onClick={() => taps++}>Tap</button></div>',
	);
	expect(actionWriting(map, 'h1')?.plan).toBeUndefined();
	expect(planFor(map, 'state:taps')).toMatchObject({ kind: 'scalar', cell: 'state:taps' });
});

test('a scalar action projected as children into a wrapping component stays eligible', async () => {
	const map = await plainSsrMap(
		'Wrapped',
		'let count = state(0); let open = state(false); <Frame title="Home"><output>{count}</output><button onClick={() => count++}>Add</button><button onClick={() => (open = !open)}>Toggle</button>@if (open) { <p>Shown</p> }</Frame>',
		"import Frame from './frame.tsrx';",
	);
	expect(planFor(map, 'state:count')).toMatchObject({ kind: 'scalar', cell: 'state:count' });
});
