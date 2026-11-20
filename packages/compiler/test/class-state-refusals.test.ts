import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

async function compiled(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Probe.tsrx', source, symbols: [] });
	return {
		diagnostics: collectTsrxModuleDiagnostics(result),
		modules: result.symbolModules.modules,
	};
}

async function codes(source: string): Promise<string[]> {
	return (await compiled(source)).diagnostics.map((diagnostic) => diagnostic.code);
}

function component(prelude: string, initial: string, markup: string): string {
	return `import { state } from '@markless/core';
${prelude}
export function App() @{
	let cart = state(${initial});
	${markup}
}`;
}

const CART = 'class Cart { bags = 0; add(n) { this.bags += n; } addBags(n) { this.bags += n; } }';

test.each([
	['a project class', CART, 'new Cart()'],
	['an array of project class instances', CART, '[new Cart(), new Cart()]'],
	['a project class behind a type assertion', CART, '(new Cart() as Cart)'],
	['a local class that shadows the built-in Map', 'class Map { bags = 0; }', 'new Map()'],
	['a global the serializer cannot encode', '', 'new AbortController()'],
])('a state() value holding %s fails the build', async (_, prelude, initial) => {
	expect(await codes(component(prelude, initial, '<p>{cart.bags}</p>'))).toContain(
		'MARKLESS_STATE_CLASS_INSTANCE',
	);
});

test.each([
	['a plain object', '', '{ bags: 0 }'],
	['a built-in Map', '', 'new Map()'],
	['a built-in Set', '', 'new Set()'],
	['a built-in Date', '', 'new Date(0)'],
	['new Array()', '', 'new Array(3)'],
	['new Object()', '', 'new Object()'],
	['the result of a call', CART, 'Object.freeze({ bags: 0 })'],
])('a state() value holding %s builds', async (_, prelude, initial) => {
	expect(await codes(component(prelude, initial, '<p>{String(cart)}</p>'))).not.toContain(
		'MARKLESS_STATE_CLASS_INSTANCE',
	);
});

test('the class refusal names the binding, the expression and a rewrite', async () => {
	const { diagnostics } = await compiled(component(CART, 'new Cart()', '<p>{cart.bags}</p>'));
	const refusal = diagnostics.find((diagnostic) => diagnostic.code === 'MARKLESS_STATE_CLASS_INSTANCE');
	expect(refusal).toMatchObject({ severity: 'error' });
	expect(refusal?.message).toContain('state "cart"');
	expect(refusal?.message).toContain('`new Cart()`');
	expect(refusal?.why).toContain('methods');
	expect(refusal?.suggestions?.map((suggestion) => suggestion.message).join('\n')).toContain(
		'function',
	);
	expect(refusal?.primarySpan).toBeDefined();
});

test.each([
	['a method with its own name', 'cart.addBags(1)'],
	['a method named like Set.add', 'cart.add(1)'],
])('calling %s on a class instance in state fails the build', async (_, call) => {
	const { diagnostics, modules } = await compiled(
		component(CART, 'new Cart()', `<button onClick={() => { ${call}; }}>{cart.bags}</button>`),
	);
	const refusal = diagnostics.find(
		(diagnostic) => diagnostic.code === 'MARKLESS_STATE_CLASS_METHOD_CALL',
	);
	expect(refusal?.message).toContain(`\`${call}\``);
	expect(refusal?.message).toContain('"cart"');
	const handlers = modules.filter((module) => module.kind === 'event-handler');
	expect(handlers.map((module) => module.source).join('\n')).not.toContain('graph.call(');
});

test('calling a method on a class instance a state() row holds fails the build', async () => {
	expect(
		await codes(`import { state } from '@markless/core';
class Line { qty = 0; sku = 'a'; bump() { this.qty += 1; } }
export function App() @{
	let lines = state([new Line()]);
	<ul>
		@for (const line of lines; key line.sku) {
			<li><button onClick={() => { line.bump(); }}>{line.qty}</button></li>
		}
	</ul>
}`),
	).toContain('MARKLESS_STATE_CLASS_METHOD_CALL');
});

test('a collection method on a local class named Map is not lowered as the built-in', async () => {
	const { diagnostics, modules } = await compiled(
		component(
			'class Map { entries = {}; set(key, value) { this.entries[key] = value; } }',
			'new Map()',
			`<button onClick={() => { cart.set('a', 1); }}>{String(cart)}</button>`,
		),
	);
	expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_STATE_CLASS_METHOD_CALL',
	);
	const handlers = modules.filter((module) => module.kind === 'event-handler');
	expect(handlers.map((module) => module.source).join('\n')).not.toContain('graph.call(');
});

test('a collection method on the built-in Map is still a tracked write', async () => {
	const { diagnostics, modules } = await compiled(
		component('', 'new Map()', `<button onClick={() => { cart.set('a', 1); }}>{cart.size}</button>`),
	);
	expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
	const handlers = modules.filter((module) => module.kind === 'event-handler');
	expect(handlers.map((module) => module.source).join('\n')).toContain('method: "set"');
});

test('data with a function beside it, and an instance built inside the handler, build', async () => {
	expect(
		(
			await compiled(
				component(
					'function addBags(cart, n) { cart.bags += n; }',
					'{ bags: 0 }',
					'<button onClick={() => { addBags(cart, 1); }}>{cart.bags}</button>',
				),
			)
		).diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
	expect(
		(
			await compiled(
				component(
					'class Counter { constructor(bags) { this.bags = bags; } add(n) { this.bags += n; } }',
					'{ bags: 0 }',
					'<button onClick={() => { const c = new Counter(cart.bags); c.add(1); cart.bags = c.bags; }}>{cart.bags}</button>',
				),
			)
		).diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
});

test('a method of a class instance in state used as an event handler fails the build', async () => {
	const { diagnostics } = await compiled(
		component(CART, 'new Cart()', '<button onClick={cart.add}>{cart.bags}</button>'),
	);
	const refusal = diagnostics.find(
		(diagnostic) => diagnostic.code === 'MARKLESS_STATE_CLASS_METHOD_UNBOUND',
	);
	expect(refusal?.severity).toBe('error');
	expect(refusal?.message).toContain('`onClick={cart.add}`');
	expect(refusal?.message).toContain('state "cart"');
	expect(refusal?.suggestions?.[0]?.message).toContain('() => cart.add()');
});

test('a method of a class instance a state() row holds, used as an event handler, fails the build', async () => {
	expect(
		await codes(`import { state } from '@markless/core';
class Line { qty = 0; sku = 'a'; bump() { this.qty += 1; } }
export function App() @{
	let lines = state([new Line()]);
	<ul>
		@for (const line of lines; key line.sku) {
			<li><button onClick={line.bump}>{line.sku}</button></li>
		}
	</ul>
}`),
	).toContain('MARKLESS_STATE_CLASS_METHOD_UNBOUND');
});

test('a method of a class instance in state wrapped in an arrow is not refused as unbound', async () => {
	expect(
		await codes(component(CART, 'new Cart()', '<button onClick={() => cart.add(1)}>{cart.bags}</button>')),
	).not.toContain('MARKLESS_STATE_CLASS_METHOD_UNBOUND');
});

test('a callback parameter that shadows a state name is not that state', async () => {
	const source = (initial: string) => `import { state } from '@markless/core';
${CART}
const others = [{ id: 1, save() {} }];
export function App() @{
	let cart = state(${initial});
	<div>
		{cart.bags}
		{others.map((cart) => <button onClick={cart.save}>{'save'}</button>)}
	</div>
}`;
	const onMain = await codes(source('{ bags: 0 }'));
	expect(onMain).not.toContain('MARKLESS_STATE_CLASS_METHOD_UNBOUND');
	expect(onMain.filter((code) => code.startsWith('MARKLESS_STATE_CLASS'))).toEqual([]);
	expect(await codes(source('new Cart()'))).not.toContain('MARKLESS_STATE_CLASS_METHOD_UNBOUND');
});

test('a field of plain-object state used as a handler is not refused as a class method', async () => {
	expect(
		await codes(component('', '{ bags: 0 }', '<button onClick={cart.bags}>{cart.bags}</button>')),
	).not.toContain('MARKLESS_STATE_CLASS_METHOD_UNBOUND');
});

test('a constant bound to a class instance, then put in state, fails the build', async () => {
	const { diagnostics, modules } = await compiled(`import { state } from '@markless/core';
${CART}
export function App() @{
	const inst = new Cart();
	let cart = state(inst);
	<button onClick={() => { cart.add(1); }}>{cart.bags}</button>
}`);
	const found = diagnostics.map((diagnostic) => diagnostic.code);
	expect(found).toContain('MARKLESS_STATE_CLASS_INSTANCE');
	expect(found).toContain('MARKLESS_STATE_CLASS_METHOD_CALL');
	const handlers = modules.filter((module) => module.kind === 'event-handler');
	expect(handlers.map((module) => module.source).join('\n')).not.toContain('graph.call(');
});

test('a carried subclass is printed after the class it extends', async () => {
	const { modules } = await compiled(`import { state } from '@markless/core';
class Base { one() { return 1; } }
class Derived extends Base { two() { return 2; } }
export function App() @{
	let count = state(new Derived().two());
	<button onClick={() => { count += 1; }}>{count}</button>
}`);
	const initializer = modules.find((module) => module.kind === 'state-initializer')?.source ?? '';
	expect(initializer.indexOf('class Base')).toBeGreaterThan(-1);
	expect(initializer.indexOf('class Base')).toBeLessThan(initializer.indexOf('class Derived'));
});

test('a TypeScript parameter property is a diagnostic, not a thrown exception', async () => {
	const { diagnostics } = await compiled(`import { state } from '@markless/core';
class Item { constructor(public sku: string) {} }
const item = new Item('a');
export function App() @{
	let count = state(0);
	<button onClick={() => { count = item.sku.length; }}>{count}</button>
}`);
	const refusal = diagnostics.find(
		(diagnostic) => diagnostic.code === 'MARKLESS_TYPE_STRIP_PARAMETER_PROPERTY',
	);
	expect(refusal?.severity).toBe('error');
	expect(refusal?.message).toContain('Item');
	expect(refusal?.message).toContain('sku');
	expect(refusal?.primarySpan).toBeDefined();
});

test('a field assigned in the constructor builds', async () => {
	expect(
		(
			await compiled(`import { state } from '@markless/core';
class Item { sku: string; constructor(sku: string) { this.sku = sku; } }
const item = new Item('a');
export function App() @{
	let count = state(0);
	<button onClick={() => { count = item.sku.length; }}>{count}</button>
}`)
		).diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([]);
});
