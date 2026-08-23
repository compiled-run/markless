import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import {
	SHARED_FACTORY_CLASS_INSTANCE_CODE,
	STATE_PROPERTY_CLASS_INSTANCE_CODE,
} from '../src/passes/capture-analysis.ts';
import { MODULE_INSTANCE_DIVERGENT_HANDLERS_CODE } from '../src/passes/symbol-modules.ts';

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

/**
 * The three refusals below close shapes that compiled clean and crashed at
 * render or at click. Each pairs with the supported shape next to it, because a
 * refusal that also refuses working code is a worse defect than the one it fixes.
 */

const NAV_CLASS = `
class Nav {
	index = 0;
	next() { this.index += 1; return this.index; }
}
`;

async function diagnosticCodes(source: string): Promise<ReadonlyArray<string>> {
	const result = await compileTsrxModule({ filename: 'src/Probe.tsrx', source, symbols: [] });
	return collectTsrxModuleDiagnostics(result).map((diagnostic) => diagnostic.code);
}

async function refusal(source: string, code: string) {
	const result = await compileTsrxModule({ filename: 'src/Probe.tsrx', source, symbols: [] });
	const diagnostic = collectTsrxModuleDiagnostics(result).find((entry) => entry.code === code);
	expect(diagnostic, `no ${code} diagnostic`).toBeDefined();
	// Build-blocking, not advisory: these shapes produce output that throws.
	expect(diagnostic?.severity).toBe('error');
	return diagnostic;
}

/**
 * A shared() factory declares the graph fields the payload carries. Returning an
 * instance declares none, so the definition records an empty field list, the SSR
 * module falls through to a residue branch that names an undeclared binding, and
 * the emitted handler names it too.
 */
test('a shared() factory returning a class instance is refused', async () => {
	const diagnostic = await refusal(
		`
import { shared } from '@markless/core';
${NAV_CLASS}
export const nav = shared(() => new Nav(), { scope: 'widget' });

export function App() @{
	let n = nav();
	<button onClick={() => { n.next(); }}>go</button>
}
`,
		SHARED_FACTORY_CLASS_INSTANCE_CODE,
	);

	expect(diagnostic?.message).toContain('nav');
	// The message has to name the rewrite, not just the refusal.
	expect(diagnostic?.suggestions.map((entry) => entry.message).join(' ')).toContain('plain object');
});

/** The factory-object idiom the refusal points at stays clean. */
test('a shared() factory returning a plain object with methods is not refused', async () => {
	const codes = await diagnosticCodes(`
import { shared } from '@markless/core';

export const nav = shared(() => ({
	index: 0,
	next() { this.index += 1; return this.index; },
}), { scope: 'widget' });

export function App() @{
	let n = nav();
	<button onClick={() => { n.next(); }}>{n.index}</button>
}
`);

	expect(codes).not.toContain(SHARED_FACTORY_CLASS_INSTANCE_CODE);
	expect(codes).not.toContain(STATE_PROPERTY_CLASS_INSTANCE_CODE);
});

/**
 * A field is only carried when the graph declares it. An instance on a factory
 * object or a state() initializer is rebuilt from declared fields only, so the
 * field is a hole on the server and a receiver-less method in the browser.
 */
test('a class instance on a state() initializer is refused', async () => {
	const diagnostic = await refusal(
		`
import { state } from '@markless/core';
${NAV_CLASS}
export function App() @{
	let s = state({ nav: new Nav(), index: 0 });
	<button onClick={() => { s.index = s.index + 1; }}>{s.index}</button>
}
`,
		STATE_PROPERTY_CLASS_INSTANCE_CODE,
	);

	// The field, not just the binding, so the author knows where to look.
	expect(diagnostic?.message).toContain('"nav"');
});

/** Same code, the other producer: a class instance on a shared() factory object. */
test('a class instance on a shared() factory object is refused', async () => {
	const diagnostic = await refusal(
		`
import { shared } from '@markless/core';
${NAV_CLASS}
export const spike = shared(() => ({ count: 0, nav: new Nav() }), { scope: 'widget' });

export function App() @{
	let s = spike();
	<button onClick={() => { s.count = s.count + 1; }}>{s.count}</button>
}
`,
		STATE_PROPERTY_CLASS_INSTANCE_CODE,
	);

	expect(diagnostic?.message).toContain('"nav"');
});

/**
 * The serializable built-ins the graph already carries are not class instances
 * for this purpose, and a plain nested object is not one either.
 */
test('serializable built-in and plain-object fields are not refused', async () => {
	const codes = await diagnosticCodes(`
import { state } from '@markless/core';

export function App() @{
	let s = state({ when: new Date(0), tags: new Set(), inner: { index: 0 } });
	<button onClick={() => { s.inner.index = s.inner.index + 1; }}>{s.inner.index}</button>
}
`);

	expect(codes).not.toContain(STATE_PROPERTY_CLASS_INSTANCE_CODE);
});

/**
 * The carry that makes a browser-only instance work copies the declaration into
 * every handler module that names it. Two handlers therefore get two instances,
 * and the divergence is silent — no error, no drift signal, just two counters.
 */
test('a module-scope instance carried into two handlers is refused', async () => {
	const diagnostic = await refusal(
		`
import { state } from '@markless/core';
${NAV_CLASS}
const nav = new Nav();

export function App() @{
	let count = state(0);
	<div>
		<button onClick={() => { count = nav.next(); }}>go</button>
		<button onClick={() => { count = nav.next() + 1; }}>go2</button>
	</div>
}
`,
		MODULE_INSTANCE_DIVERGENT_HANDLERS_CODE,
	);

	expect(diagnostic?.message).toContain('"nav"');
	// Both routes out, because which one is right depends on whether the value
	// has to survive resume.
	const suggestions = diagnostic?.suggestions.map((entry) => entry.message).join(' ') ?? '';
	expect(suggestions).toContain('own module');
	expect(suggestions).toContain('shared()');
});

/**
 * One handler is the shape the carry exists for: the instance is built inside
 * that handler's own module, after resume, and there is nothing to diverge from.
 */
test('a module-scope instance carried into one handler is not refused', async () => {
	const codes = await diagnosticCodes(`
import { state } from '@markless/core';
${NAV_CLASS}
const nav = new Nav();

export function App() @{
	let count = state(0);
	<button onClick={() => { count = nav.next(); }}>go</button>
}
`);

	expect(codes).not.toContain(MODULE_INSTANCE_DIVERGENT_HANDLERS_CODE);
});
