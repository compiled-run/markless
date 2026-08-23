import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * A handler symbol module is a module of its own. A same-file module-scope
 * `const`/`function`/`class` that the handler body still names after lowering
 * therefore has to be carried into that module, or the emitted symbol references
 * a binding nothing declares.
 *
 * This is the enabler the browser-only-instance design rests on: the instance is
 * built lazily inside the handler's own module, so the class and its module-level
 * cache have to arrive there. Nothing here runs before the first interaction —
 * a symbol module is fetched when a handler fires, not at load.
 */

async function handlerModule(source: string, filename = 'src/Probe.tsrx'): Promise<string> {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler');
	expect(handler, 'compile produced no event-handler symbol module').toBeDefined();
	return handler?.source ?? '';
}

test('a module-scope class and its instance reach the handler symbol module', async () => {
	const emitted = await handlerModule(`
import { state } from '@markless/core';

class Nav {
	index = 0;
	next() {
		this.index += 1;
		return this.index;
	}
}

const nav = new Nav();

export function App() @{
	let count = state(0);
	<button onClick={() => { count = nav.next(); }}>go</button>
}
`);

	expect(emitted).toContain('class Nav');
	expect(emitted).toContain('const nav = new Nav()');
	// The read that motivated the carry still lowers to a plain field access, not
	// a graph read: the instance is the handler module's own, not payload data.
	expect(emitted).toContain('nav.next()');
});

/**
 * Reachability finds `const nav = new Nav()` before it finds `class Nav`, because
 * the handler names `nav` and only reaching `nav` reaches `Nav`. Emitting them in
 * that order runs the constructor while the class binding is still in its
 * temporal dead zone, so the module throws the moment the first interaction loads
 * it. Authored order is the order the consumer already proved evaluates.
 */
test('carried declarations keep authored order, so a class precedes its instance', async () => {
	const emitted = await handlerModule(`
import { state } from '@markless/core';

class Nav {
	index = 0;
	next() { this.index += 1; return this.index; }
}

const nav = new Nav();

export function App() @{
	let count = state(0);
	<button onClick={() => { count = nav.next(); }}>go</button>
}
`);

	expect(emitted.indexOf('class Nav')).toBeGreaterThan(-1);
	expect(emitted.indexOf('class Nav')).toBeLessThan(emitted.indexOf('const nav = new Nav()'));
});

/**
 * The gap is not class-specific. A plain module-scope function called from a
 * handler was unresolved the same way, which is why the existing suggestion text
 * ("hoist serializable helpers to module scope") did not hold for same-file
 * module scope.
 */
test('a module-scope plain function reaches the handler symbol module', async () => {
	const emitted = await handlerModule(`
import { state } from '@markless/core';

function bump(value) {
	return value + 1;
}

export function App() @{
	let count = state(0);
	<button onClick={() => { count = bump(count); }}>go</button>
}
`);

	expect(emitted).toContain('function bump(value)');
	expect(emitted).toContain('bump(');
});

/** The transitive close: a carried declaration drags in what it itself names. */
test('a declaration a carried declaration names is carried too', async () => {
	const emitted = await handlerModule(`
import { state } from '@markless/core';

const STEP = 5;

function bump(value) {
	return value + STEP;
}

export function App() @{
	let count = state(0);
	<button onClick={() => { count = bump(count); }}>go</button>
}
`);

	expect(emitted).toContain('const STEP = 5');
	expect(emitted).toContain('function bump(value)');
});

/** Only what the emitted body still names is carried; the rest costs no bytes. */
test('a module-scope declaration the handler never names is not carried', async () => {
	const emitted = await handlerModule(`
import { state } from '@markless/core';

const USED = 1;
const UNUSED = 2;

export function App() @{
	let count = state(0);
	<button onClick={() => { count = count + USED; }}>go</button>
}
`);

	expect(emitted).toContain('const USED = 1');
	expect(emitted).not.toContain('UNUSED');
});

/**
 * A carried declaration's own free names decide imports too: the import filter
 * reads the emitted body, and before the carry the declaration's needs were not
 * part of it.
 */
test('an import a carried declaration needs is carried with it', async () => {
	const emitted = await handlerModule(`
import { state } from '@markless/core';
import { STEP } from './constants';

function bump(value) {
	return value + STEP;
}

export function App() @{
	let count = state(0);
	<button onClick={() => { count = bump(count); }}>go</button>
}
`);

	expect(emitted).toContain('function bump(value)');
	expect(emitted).toContain(`from "./constants"`);
});

/**
 * A name the lowering turned into a graph read is no longer a reference to a
 * module binding, so it must not drag a same-named module declaration in.
 */
test('a state name is not confused with a module-scope declaration', async () => {
	const emitted = await handlerModule(`
import { state } from '@markless/core';

const total = 99;

export function App() @{
	let count = state(0);
	<button onClick={() => { count = count + 1; }}>go</button>
}
`);

	expect(emitted).not.toContain('const total = 99');
});
