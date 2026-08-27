import { expect, test } from 'vitest';
import { COMPUTED_READ_CALLED_CODE } from '../../src/passes/foreign-scope.ts';
import { callRefusals, compileAll, compileOne, errors, servedSource } from './support.ts';

// Fail-closed. A cell read spelled `loud()` compiled clean and threw: the served
// module bound `loud` to the derived value and called it, and the browser module
// emitted `context.graph.read(...)()`. Neither emission can be made sound
// without contradicting what computed() answers with, so the shape is refused
// before either one ships.

const CALL = `
import { shared, state, computed } from '@markless/core';

export const box = shared(() => {
	const s = state({ label: 'a' });
	const loud = computed(() => s.label.toUpperCase());
	const asked = computed(() => loud() + '?');
	return { ...s, loud, asked };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.asked}</div>
}
`;

test('a sibling read spelled as a call is refused, naming both cells', async () => {
	const compiled = await compileOne('src/family.tsrx', CALL);
	const refusals = callRefusals(compiled);

	expect(refusals.length).toBe(1);
	const said = [
		refusals[0]!.title,
		refusals[0]!.message,
		...refusals[0]!.suggestions.map((item) => item.message),
	].join('\n');
	expect(said).toContain('"loud"');
	expect(said).toContain('"asked"');
	expect(said).toContain('loud()');
	expect(refusals[0]!.docsUrl).toContain(COMPUTED_READ_CALLED_CODE);
});

test('the refusal names both emissions it stands in front of', async () => {
	const compiled = await compileOne('src/family.tsrx', CALL);
	expect(callRefusals(compiled)[0]!.artifactKeys).toEqual(['publicRenderModule', 'symbolModules']);
});

const CHAIN_CALL = `
import { shared, state, computed } from '@markless/core';

export const box = shared(() => {
	const s = state({ label: 'a' });
	const loud = computed(() => s.label.toUpperCase());
	const banged = computed(() => loud() + '!');
	const asked = computed(() => banged() + '?');
	return { ...s, loud, banged, asked };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.asked}</div>
}
`;

test('every link of a chain that calls its sibling is named, not just the first', async () => {
	const compiled = await compileOne('src/family.tsrx', CHAIN_CALL);
	const said = callRefusals(compiled).map((item) => item.title);

	expect(said.length).toBe(2);
	expect(said.some((title) => title.includes('"loud"'))).toBe(true);
	expect(said.some((title) => title.includes('"banged"'))).toBe(true);
});

// A component-local computed is a render-body local on the server and a derive
// module in the browser. Both spell the call, so both need the same refusal.
const LOCAL_CALL = `
import { state, computed } from '@markless/core';

export default function Panel() @{
	const s = state({ label: 'a' });
	const loud = computed(() => s.label.toUpperCase());
	const asked = computed(() => loud() + '?');
	<p data-panel>{asked}</p>
}
`;

test('a component-local sibling call is refused too', async () => {
	const compiled = await compileOne('src/panel.tsrx', LOCAL_CALL);
	expect(callRefusals(compiled).length).toBe(1);
	// The shape the refusal stands in front of: the served body calls the local
	// that already holds the derived value.
	expect(servedSource(compiled)).toContain(`const asked = (() => loud() + '?')();`);
});

const CONSUMER = `
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<section data-page>{b.asked}</section>
}
`;

test('a module that copies a sibling-calling factory expression refuses it too', async () => {
	const [definer, consumer] = await compileAll([
		{ filename: 'src/family.tsrx', source: CALL, importSource: './family.tsrx' },
		{ filename: 'src/consumer.tsrx', source: CONSUMER },
	]);

	expect(callRefusals(definer!).length).toBe(1);
	// The expression travels with the foreign-scope carry, so the consumer
	// compiles the same call on its own: the defining file's diagnostics are not
	// attached to this module's compile.
	expect(callRefusals(consumer!).length).toBe(1);
	expect(callRefusals(consumer!)[0]!.message).toContain('"loud"');
});

// The refusal has to key off what the expression READS, not off the presence of
// a call: a factory calling its own helper on a cell value is the shape families
// ship, and it must stay clean.
const HELPER_CALL = `
import { shared, state, computed } from '@markless/core';

function shout(text) { return String(text).toUpperCase(); }

export const dial = shared(() => {
	const cell = state({ label: 'a' });
	const loud = computed(() => shout(cell.label));
	const asked = computed(() => shout(loud) + '?');
	return { ...cell, loud, asked };
}, { scope: 'widget' });

export default function Dial() @{
	const d = dial();
	<span data-dial>{d.asked}</span>
}
`;

test('a helper called on a sibling cell value is not refused', async () => {
	const compiled = await compileOne('src/dial.tsrx', HELPER_CALL);
	expect(errors(compiled)).toEqual([]);
});

// A local of the same name shadows the cell inside the expression, so the call
// belongs to the local and nothing is refused.
const SHADOWED_CALL = `
import { shared, state, computed } from '@markless/core';

export const box = shared(() => {
	const s = state({ label: 'a' });
	const loud = computed(() => s.label.toUpperCase());
	const asked = computed(() => {
		const shout = (text) => text + '?';
		return shout(loud);
	});
	return { ...s, loud, asked };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.asked}</div>
}
`;

test('a call of a local function inside the expression is left alone', async () => {
	const compiled = await compileOne('src/family.tsrx', SHADOWED_CALL);
	expect(callRefusals(compiled)).toEqual([]);
});
