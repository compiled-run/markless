import { expect, test } from 'vitest';
import { compileOne, errors, said } from './support.ts';

// A capture is a binding, not a name: a handler that declares its own `loud`
// says nothing about the component-scope `loud` the markup reads.
const SHADOWED_COMPUTED = `
import { state, computed } from '@markless/core';

export default function Panel() @{
	const s = state({ label: 'a', seen: '' });
	const loud = computed(() => s.label.toUpperCase());
	<button data-panel onClick={() => { const loud = (text) => text + '!'; s.seen = loud(s.label); }}>{loud}</button>
}
`;

test('a handler local does not blame the component computed the markup reads', async () => {
	const compiled = await compileOne('src/panel.tsrx', SHADOWED_COMPUTED);
	expect(said(compiled)).toBe('');
});

test('the markup update still routes to the computed', async () => {
	const compiled = await compileOne('src/panel.tsrx', SHADOWED_COMPUTED);
	const domUpdate = compiled.symbolResolver.symbols.find((item) => item.kind === 'dom-update');
	expect(domUpdate).toMatchObject({ source: 'loud', graphNodeId: 'computed:loud' });
});

// The same shape with every name, element, event, and local kind changed.
const SHADOWED_ALTERNATE = `
import { state, computed } from '@markless/core';

export default function Ticker() @{
	const cell = state({ raw: 'a', shown: '' });
	const trimmed = computed(() => cell.raw.trim());
	<a data-ticker href="#" onFocus={() => { const trimmed = new Map(); cell.shown = String(trimmed.size); }}>{trimmed}</a>
}
`;

test('the same shadowing under different names, element, event, and local kind', async () => {
	const compiled = await compileOne('src/ticker.tsrx', SHADOWED_ALTERNATE);
	expect(said(compiled)).toBe('');
	const domUpdate = compiled.symbolResolver.symbols.find((item) => item.kind === 'dom-update');
	expect(domUpdate).toMatchObject({ graphNodeId: 'computed:trimmed' });
});

const SHADOWED_PROP = `
import { state } from '@markless/core';

export default function Badge({ label }) @{
	const cell = state({ seen: '' });
	<button data-badge onClick={() => { const label = (text) => text + '!'; cell.seen = label(''); }}>{label}</button>
}
`;

test('a handler local named like a prop leaves the prop read alone', async () => {
	const compiled = await compileOne('src/badge.tsrx', SHADOWED_PROP);
	expect(said(compiled)).toBe('');
});

// The local sits two functions deep, so a scope test that only looked one level
// in would still see it.
const NESTED_CALLBACK = `
import { state, computed } from '@markless/core';

export default function Feed() @{
	const cell = state({ items: ['a'], seen: '' });
	const first = computed(() => cell.items[0] ?? '');
	<button data-feed onClick={() => { cell.seen = cell.items.map((item) => { const first = (text) => text + '!'; return first(item); }).join(''); }}>{first}</button>
}
`;

test('a local declared inside a callback nested in the handler stays that callback own', async () => {
	const compiled = await compileOne('src/feed.tsrx', NESTED_CALLBACK);
	expect(said(compiled)).toBe('');
	const domUpdate = compiled.symbolResolver.symbols.find((item) => item.kind === 'dom-update');
	expect(domUpdate).toMatchObject({ graphNodeId: 'computed:first' });
});

const HANDLER_CAPTURES_COMPONENT_LOCAL = `
import { state } from '@markless/core';

export default function Panel() @{
	const s = state({ label: 'a', seen: '' });
	const decorate = (text) => text + '!';
	<button data-panel onClick={() => { s.seen = decorate(s.label); }}>{s.seen}</button>
}
`;

test('a handler reading a component-scope local function is still refused', async () => {
	const compiled = await compileOne('src/panel.tsrx', HANDLER_CAPTURES_COMPONENT_LOCAL);
	const refusals = errors(compiled);
	expect(refusals.map((item) => item.code)).toEqual(['MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED']);
	expect(refusals[0]!.message).toContain('"decorate"');
});

// The markup reads the computed, and the computed is what closes over the
// component-scope local, so the refusal lands on the derive the markup depends on.
const DERIVE_CAPTURES_COMPONENT_LOCAL = `
import { state, computed } from '@markless/core';

export default function Panel() @{
	const s = state({ label: 'a', seen: '' });
	const decorate = (text) => text + '!';
	const loud = computed(() => decorate(s.label));
	<button data-panel onClick={() => { s.seen = 'b'; }}>{loud}</button>
}
`;

test('a derive behind a markup read that captures a component-scope local is still refused', async () => {
	const compiled = await compileOne('src/panel.tsrx', DERIVE_CAPTURES_COMPONENT_LOCAL);
	const refusals = errors(compiled);
	expect(refusals.map((item) => item.code)).toEqual(['MARKLESS_CAPTURE_UNSUPPORTED_VALUE']);
	expect(refusals[0]!.message).toContain('"decorate"');
});

// Shadowing in one handler must not clear the other handler that really does
// close over the component-scope binding, and must not double-report it.
const SHADOW_AND_CAPTURE = `
import { state } from '@markless/core';

export default function Panel() @{
	const s = state({ label: 'a', seen: '' });
	const decorate = (text) => text + '!';
	<div data-panel>
		<button data-shadow onClick={() => { const decorate = (text) => text; s.seen = decorate(s.label); }}>one</button>
		<button data-capture onClick={() => { s.seen = decorate(s.label); }}>two</button>
	</div>
}
`;

test('one handler shadowing the name leaves exactly one refusal for the handler that captures it', async () => {
	const compiled = await compileOne('src/panel.tsrx', SHADOW_AND_CAPTURE);
	const refusals = errors(compiled);
	expect(refusals.length).toBe(1);
	expect(refusals[0]!.message).toContain('"decorate"');
});
