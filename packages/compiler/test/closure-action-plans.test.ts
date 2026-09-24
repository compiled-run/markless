import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function plainSsrMap(name: string, body: string, imports = '') {
	const compiled = await compileTsrxModule({
		filename: `/src/${name}.tsrx`,
		buildId: 'closure',
		resolverId: 'closure',
		symbols: [],
		source: `import { state, computed, element } from '@markless/core'; ${imports} export default function ${name}() @{ ${body} }`,
	});
	expect(compiled.protocolView.events.length).toBeGreaterThan(0);
	return compiled.runtimeDemandMaps['plain-ssr'];
}

type Map = Awaited<ReturnType<typeof plainSsrMap>>;

function closureOn(map: Map, hostNodeId: string, eventName = 'click') {
	const plan = map.actions.find(
		(action) => action.hostNodeId === hostNodeId && action.eventName === eventName,
	)?.plan;
	return plan?.kind === 'closure' ? plan : undefined;
}

function hostOfEvent(map: Map, index = 0) {
	return map.actions.filter((action) => action.recordKind === 'event')[index]!.hostNodeId;
}

test.each([
	[
		'Toggle',
		'let on = state(false); const label = computed(() => (on ? "On" : "Off")); <div><button aria-pressed={on ? "true" : "false"} onClick={() => (on = !on)}>T</button><span>{label}</span></div>',
		['state:on'],
		2,
	],
	[
		'Stepper',
		'let level = state(3); const squared = computed(() => `Sq ${level * level}`); const atMin = computed(() => level <= 0); <section><button disabled={atMin} onClick={() => (level = Math.max(0, level - 1))}>-</button><output>{level}</output><p>{squared}</p></section>',
		['state:level'],
		3,
	],
	[
		'Chooser',
		'let pick = state("a"); const chosen = computed(() => ({ a: "Alpha", b: "Beta" })[pick]); const described = computed(() => `Now ${chosen}`); <nav><a data-on={pick === "b" ? "yes" : "no"} onClick={() => { if (pick !== "b") pick = "b"; }}>B</a><em title={described}>{chosen}</em></nav>',
		['state:pick'],
		3,
	],
])(
	'%s compiles a closure plan whose updates cover every text and attribute reader',
	async (name, body, cells, updateCount) => {
		const map = await plainSsrMap(name, body);
		const plan = closureOn(map, hostOfEvent(map));
		expect(plan).toMatchObject({ kind: 'closure', version: 1, cells });
		expect(plan!.updates).toHaveLength(updateCount);
		expect(map.recordKinds.find((record) => record.kind === 'event')?.replaced).toBe(true);
		const eventRecord = map.payloadRecords.find((record) => record.kind === 'event')!;
		expect(eventRecord.runtimeModuleIds).toContain('web/fns/closure-action');
		expect(eventRecord.runtimeModuleIds).not.toContain('web/payload-resume');
	},
);

test('closure computeds are listed dependencies first', async () => {
	const map = await plainSsrMap(
		'Chain',
		'let n = state(1); const c = computed(() => b + 1); const b = computed(() => a * 2); const a = computed(() => n + 1); <div><button onClick={() => n++}>+</button><i>{c}</i></div>',
	);
	const plan = closureOn(map, hostOfEvent(map))!;
	const order = plan.computed.map((node) => node.graphNodeId);
	expect(order.indexOf('computed:a')).toBeLessThan(order.indexOf('computed:b'));
	expect(order.indexOf('computed:b')).toBeLessThan(order.indexOf('computed:c'));
});

test('a closure reads cells the handler reads but never writes', async () => {
	const map = await plainSsrMap(
		'Reads',
		'let step = state(2); let total = state(0); <div><output>{total}</output><button onClick={() => (total = total + step)}>Add</button><output>{step}</output></div>',
	);
	const plan = closureOn(map, 'h2')!;
	expect(plan.cells).toEqual(['state:step', 'state:total']);
	expect(plan.updates.map((update) => update.graphNodeId)).toEqual(['state:total']);
});

test('a scalar-eligible action keeps its scalar plan', async () => {
	const map = await plainSsrMap(
		'Counter',
		'let count = state(0); <div><output>{count}</output><button onClick={() => count++}>+</button></div>',
	);
	expect(map.actions[0]!.plan?.kind).toBe('scalar');
});

test.each([
	[
		'a branch test reads a derived value',
		'let on = state(false); const shown = computed(() => !on); <div><button onClick={() => (on = !on)}>T</button>@if (shown) { <p>Hi</p> }</div>',
	],
	[
		'a keyed repeat renders the written cell',
		'let items = state(["a"]); let flag = state(false); const list = computed(() => (flag ? ["a", "b"] : ["a"])); <div><button onClick={() => (flag = !flag)}>T</button><ul>@for (const item of list; key item) { <li>{item}</li> }</ul></div>',
	],
	[
		'the handler awaits',
		'let on = state(false); <div><button onClick={async () => { await Promise.resolve(); on = !on; }}>T</button><span data-on={on ? "y" : "n"}>x</span></div>',
	],
	[
		'the handler calls an element handle',
		'let on = state(false); const box = element(); <div><button onClick={() => { box?.focus(); on = !on; }}>T</button><input el={box} data-on={on ? "y" : "n"} /></div>',
	],
	[
		'a property binding reads the written cell',
		'let text = state(""); <div><button onClick={() => (text = "x")}>T</button><input value={text} /></div>',
	],
	[
		'an object cell is written',
		'let point = state({ x: 1 }); <div><button onClick={() => (point = { x: 2 })}>T</button><span>{point.x}</span></div>',
	],
	[
		'a behavior sits on the event host',
		'let on = state(false); <div><button attach={(host) => { host.dataset.ready = "yes"; }} onClick={() => (on = !on)}>T</button><span data-on={on ? "y" : "n"}>x</span></div>',
	],
	[
		'a child component receives the written cell',
		'let on = state(false); <div><button onClick={() => (on = !on)}>T</button><Child value={on} /></div>',
		"import Child from './child.tsrx';",
	],
	[
		'a cell starts as a constructed Date',
		'let stamp = state(new Date("2026-01-15T00:00:00.000Z")); let result = state(0); <div><button onClick={() => { result = stamp.setMonth(2); }}>T</button><output>{result}</output></div>',
	],
	[
		'a cell starts as a constructed URL',
		'let link = state(new URL("https://example.com/a")); let label = state(""); <p><a onClick={() => (label = link.pathname)}>L</a><em>{label}</em></p>',
	],
	[
		'a cell starts as a regular expression literal',
		'let pattern = state(/ab+/); let hits = state(0); <div><button onClick={() => { hits = pattern.test("abb") ? 1 : 0; }}>T</button><output>{hits}</output></div>',
	],
	[
		'the handler hands a write to a timer',
		'let timer = state(0); let ticks = state(0); <div><button onPointerdown={() => { timer = window.setInterval(() => { ticks = ticks + 1; }, 100); }}>T</button><output>{ticks}</output></div>',
	],
	[
		'the handler hands a write to a promise callback',
		'let done = state(false); <section><a onClick={() => { Promise.resolve().then(function () { done = true; }); }}>Go</a><i data-done={done ? "y" : "n"}>x</i></section>',
	],
	[
		'an overlay mark sits anywhere in the module',
		'let open = state(false); <section><button onClick={() => { open = true; }}>Open</button><div overlay role="dialog" hidden={open !== true}><p>Body</p></div></section>',
	],
])('refuses a closure plan when %s', async (_reason, body, imports = '') => {
	const map = await plainSsrMap('Refused', body, imports);
	expect(map.actions.every((action) => action.plan?.kind !== 'closure')).toBe(true);
});

test.each([
	[
		'an imported constant seeds the cell',
		'let level = state(START); <div><button onClick={() => (level = level + 1)}>+</button><span data-level={level > 2 ? "hi" : "lo"}>{level}</span></div>',
		"import { START } from './limits.ts';",
	],
	[
		'the handler calls a synchronous array callback that reads no graph',
		'let total = state(0); <div><button onClick={() => (total = [1, 2, 3].reduce((sum, value) => sum + value, total))}>+</button><span title={total > 5 ? "big" : "small"}>{total}</span></div>',
	],
])('still plans a closure when %s', async (_reason, body, imports = '') => {
	const map = await plainSsrMap('Kept', body, imports);
	expect(map.actions.some((action) => action.plan?.kind === 'closure')).toBe(true);
});

test('refusing one action keeps a sibling closure eligible', async () => {
	const map = await plainSsrMap(
		'Mixed',
		'let on = state(false); let open = state(false); <div><button onClick={() => (on = !on)}>T</button><span data-on={on ? "y" : "n"}>x</span><button onClick={() => (open = !open)}>O</button>@if (open) { <p>Open</p> }</div>',
	);
	expect(closureOn(map, 'h1')).toMatchObject({ cells: ['state:on'] });
	expect(closureOn(map, 'h3')).toBeUndefined();
});

test('a prerender demand class never plans closures', async () => {
	const compiled = await compileTsrxModule({
		filename: '/src/Prerendered.tsrx',
		buildId: 'closure',
		resolverId: 'closure',
		symbols: [],
		source: `import { state } from '@markless/core'; export default function Prerendered() @{ let on = state(false); <div><button onClick={() => (on = !on)}>T</button><span data-on={on ? "y" : "n"}>x</span></div> }`,
	});
	expect(compiled.runtimeDemandMaps.prerender.actions.every((action) => !action.plan)).toBe(true);
});
