import { expect, test } from 'vitest';
import { callRefusals, compileOne, errors } from './support.ts';

// A handler is copied whole the way a derive is: its cell reads are rewritten
// into `context.graph.read(...)` and everything else is the author's own text.
// Spelled `loud()`, the emitted module called the derived value and threw a
// TypeError on the first click, with the compile clean.

const HANDLER_CALL = `
import { state, computed } from '@markless/core';

export default function Panel() @{
	const s = state({ label: 'a', seen: '' });
	const loud = computed(() => s.label.toUpperCase());
	<button data-panel onClick={() => { s.seen = loud(); }}>{s.seen}</button>
}
`;

test('a handler that calls a computed is refused, naming the call and the handler', async () => {
	const compiled = await compileOne('src/panel.tsrx', HANDLER_CALL);
	const refusals = callRefusals(compiled);

	expect(refusals.length).toBe(1);
	const said = [
		refusals[0]!.title,
		refusals[0]!.message,
		...refusals[0]!.suggestions.map((item) => item.message),
	].join('\n');
	expect(said).toContain('"loud"');
	expect(said).toContain('loud()');
	expect(said).toContain('click');
});

test('the handler refusal is the same code, covering the symbol module it stands in front of', async () => {
	const compiled = await compileOne('src/panel.tsrx', HANDLER_CALL);
	expect(callRefusals(compiled)[0]!.artifactKeys).toEqual(['publicRenderModule', 'symbolModules']);
});

// The same shape through a shared() instance: the read is spelled `b.loud`, so
// the call the handler spells is `b.loud()`.
const INSTANCE_HANDLER_CALL = `
import { shared, state, computed } from '@markless/core';

export const box = shared(() => {
	const s = state({ label: 'a', seen: '' });
	const loud = computed(() => s.label.toUpperCase());
	return { ...s, loud };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<button data-family onClick={() => { b.seen = b.loud(); }}>{b.seen}</button>
}
`;

test('a handler that calls a computed off a shared instance is refused too', async () => {
	const compiled = await compileOne('src/family.tsrx', INSTANCE_HANDLER_CALL);
	const refusals = callRefusals(compiled);

	expect(refusals.length).toBe(1);
	expect(refusals[0]!.message).toContain('b.loud()');
});

const HANDLER_VALUE = `
import { shared, state, computed } from '@markless/core';

export const box = shared(() => {
	const s = state({ label: 'a', seen: '' });
	const loud = computed(() => s.label.toUpperCase());
	return { ...s, loud };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<button data-family onClick={() => { b.seen = b.loud; }}>{b.seen}</button>
}
`;

test('a handler that reads the computed as a value compiles', async () => {
	const compiled = await compileOne('src/family.tsrx', HANDLER_VALUE);
	expect(errors(compiled)).toEqual([]);

	const handler = compiled.symbolResolver.symbols.find((item) => item.kind === 'event-handler');
	const emitted = compiled.symbolModules.modules.find(
		(module) => module.symbolId === handler?.id,
	)?.source;
	expect(emitted).toContain('computed:loud');
	expect(emitted).not.toContain('computed:loud")()');
});

// The refusal keys off what the handler READS, not off the presence of a call:
// a plain function taking the derived value is the shape families ship.
const HELPER_CALL = `
import { shared, state, computed } from '@markless/core';

function shout(text) { return String(text) + '!'; }

export const dial = shared(() => {
	const cell = state({ label: 'a', seen: '' });
	const loud = computed(() => cell.label.toUpperCase());
	return { ...cell, loud };
}, { scope: 'widget' });

export default function Dial() @{
	const d = dial();
	<button data-dial onClick={() => { d.seen = shout(d.loud); }}>{d.seen}</button>
}
`;

test('a handler calling a real function on the computed value is not refused', async () => {
	const compiled = await compileOne('src/dial.tsrx', HELPER_CALL);
	expect(errors(compiled)).toEqual([]);
});

// A local of the same name is the handler's own binding, so the call belongs to
// it and the cell of that name is not what the parentheses land on. Nothing else
// here reads `loud`: capture analysis matches captures by name across symbols,
// so a markup read of the cell would be blamed on this handler's local.
const SHADOWED_CALL = `
import { state, computed } from '@markless/core';

export default function Panel() @{
	const s = state({ label: 'a', seen: '' });
	const loud = computed(() => s.label.toUpperCase());
	<button data-panel onClick={() => { const loud = (text) => text + '!'; s.seen = loud(s.label); }}>{s.seen}</button>
}
`;

test('a handler local named like the cell is left alone', async () => {
	const compiled = await compileOne('src/panel.tsrx', SHADOWED_CALL);
	expect(errors(compiled)).toEqual([]);
	expect(callRefusals(compiled)).toEqual([]);
});
