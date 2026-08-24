/**
 * A graph read inside a value the expression just built, with a method called on
 * that value.
 *
 * `(now - tree.typeaheadAt > 750 ? key : tree.typeahead + key).toLowerCase()` in a
 * handler used to record ONE read at the whole callee chain - the parenthesized
 * ternary plus `.toLowerCase` - which names no binding, so neither `tree.*` read
 * lowered and both authored identifiers survived into the emitted module. The
 * same reads hoisted into a `const` initialiser lowered correctly, and the writes
 * lowered either way, which is what made the gap look like a lowering bug rather
 * than a collection one.
 *
 * The rule the fix restores: a member path only stands for a binding when its
 * root is a name. Rooted in a ternary, a template literal, an array literal or a
 * call, the path reaches into a computed value and the reads to record are the
 * ones inside that value.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

const SHARED_ID = 'shared:src/Tree.tsrx#tree/state:s';

async function compileTree(body: string) {
	return compileTsrxModule({
		filename: 'src/Tree.tsrx',
		source: `import { shared, state } from '@markless/core';

export const tree = shared(() => {
	const s = state({ typeahead: '', typeaheadAt: 0, active: '', open: false });
	return { ...s };
}, { scope: 'widget' });

export function Tree() @{
	const t = tree();
	<div onKeyDown={(event) => {${body}}}>{t.active}</div>
}`,
		symbols: [],
	});
}

function handlerSource(result: Awaited<ReturnType<typeof compileTree>>): string {
	const [module] = result.symbolModules.modules.filter((module) => module.kind === 'event-handler');
	expect(module).toBeDefined();
	return module?.source ?? '';
}

function readSources(result: Awaited<ReturnType<typeof compileTree>>): ReadonlyArray<string> {
	return result.semanticGraph.stateReads.map((read) => read.source);
}

test('a conditional receiver in a handler lowers every read inside it', async () => {
	// The exact spelling the tree-walk unit compiled.
	const result = await compileTree(`
		const now = Date.now();
		const key = event.key;
		const query = (now - t.typeaheadAt > 750 ? key : t.typeahead + key).toLowerCase();
		t.typeahead = query;
		t.typeaheadAt = now;
	`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.stateLowering.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const source = handlerSource(result);
	expect(source).toContain(`context.graph.read("${SHARED_ID}", ["typeaheadAt"])`);
	expect(source).toContain(`context.graph.read("${SHARED_ID}", ["typeahead"])`);
	expect(source).toContain('.toLowerCase()');
	// No authored instance read may survive the lowering.
	expect(source).not.toMatch(/(^|[^"\w.])t\.typeahead/);

	expect(readSources(result)).toContain('t.typeaheadAt');
	expect(readSources(result)).toContain('t.typeahead');
	expect(readSources(result).join('|')).not.toContain('toLowerCase');
});

test('the same conditional receiver standing inside a call argument lowers too', async () => {
	const result = await compileTree(`
		const key = event.key;
		t.active = String((t.open ? t.typeahead : key).trim());
	`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	const source = handlerSource(result);
	expect(source).toContain(`context.graph.read("${SHARED_ID}", ["open"])`);
	expect(source).toContain(`context.graph.read("${SHARED_ID}", ["typeahead"])`);
	expect(source).toContain('.trim()');
});

test('a template-literal receiver lowers the reads interpolated into it', async () => {
	const result = await compileTree(`
		const key = event.key;
		t.typeahead = \`\${t.typeahead}\${key}\`.toLowerCase();
	`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(handlerSource(result)).toContain(`context.graph.read("${SHARED_ID}", ["typeahead"])`);
});

test('nested parentheses around the receiver do not hide the read', async () => {
	const result = await compileTree(`
		t.typeahead = ((t.typeahead)).toLowerCase();
	`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(handlerSource(result)).toContain(`context.graph.read("${SHARED_ID}", ["typeahead"])`);
});

test('a member on a conditional with no call reads through the conditional', async () => {
	const result = await compileTree(`
		const key = event.key;
		t.typeaheadAt = (t.open ? t.typeahead : key).length;
	`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	const source = handlerSource(result);
	expect(source).toContain(`context.graph.read("${SHARED_ID}", ["open"])`);
	expect(source).toContain(`context.graph.read("${SHARED_ID}", ["typeahead"])`);
	expect(source).toContain('.length');

	// The whole parenthesized path is not a binding name, so nothing records it.
	expect(readSources(result).join('|')).not.toContain('? t.typeahead');
});

test('the hoisted const form that always worked still works', async () => {
	const result = await compileTree(`
		const now = Date.now();
		const key = event.key;
		const at = t.typeaheadAt;
		const previous = t.typeahead;
		const query = (now - at > 750 ? key : previous + key).toLowerCase();
		t.typeahead = query;
	`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	const source = handlerSource(result);
	expect(source).toContain(`context.graph.read("${SHARED_ID}", ["typeaheadAt"])`);
	expect(source).toContain(`context.graph.read("${SHARED_ID}", ["typeahead"])`);
});

test('a method the graph itself declares keeps its read at the member', async () => {
	// The receiver descent must not reach past a name: `t.reset` is the callable
	// the shared definition holds, so its read stays at the member path.
	const result = await compileTsrxModule({
		filename: 'src/Tree.tsrx',
		source: `import { shared, state } from '@markless/core';

export const tree = shared(() => {
	const s = state({ typeahead: '' });
	return { ...s, reset() { s.typeahead = ''; } };
}, { scope: 'widget' });

export function Tree() @{
	const t = tree();
	<button onClick={() => t.reset()}>{t.typeahead}</button>
}`,
		symbols: [],
	});

	expect(result.semanticGraph.stateReads.map((read) => read.source)).toContain('t.reset');
});
