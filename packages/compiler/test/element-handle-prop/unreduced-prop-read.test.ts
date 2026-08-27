import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { CAPTURE_OPAQUE_PROP_CODE } from '../../src/passes/capture-analysis.ts';

/**
 * A prop path state lowering cannot reduce (`steps[0].target`) produced no read
 * at all, so the prop name survived into the emitted handler module as a free
 * identifier: the build passed and the first press threw `ReferenceError`.
 * Capture analysis refuses it instead.
 */

async function compile(filename: string, source: string) {
	return compileTsrxModule({ filename, source, symbols: [] });
}

function symbolSources(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules.map((module) => module.source).join('\n');
}

test('an indexed prop path in a handler is refused rather than emitted unbound', async () => {
	const result = await compile(
		'src/Steps.tsrx',
		`
import { element } from '@markless/core';

export function StepList({ steps }) @{
	const rootEl = element<HTMLDivElement>();

	<div el={rootEl} onClick={() => {
		const first = steps[0]?.target;
		rootEl?.setAttribute('data-first', typeof first);
	}}>list</div>
}
`,
	);

	const [diagnostic] = result.captureAnalysis.diagnostics;
	expect(diagnostic?.code).toBe(CAPTURE_OPAQUE_PROP_CODE);
	expect(diagnostic?.propName).toBe('steps');
	expect(diagnostic?.message).toContain('"steps" for "StepList"');
	expect(diagnostic?.message).toContain('would reach the browser unbound');
});

// Alternate shape: different component, prop, element and index spelling, and
// the unreducible path reached through a computed key rather than a literal one.
test('the refusal follows the shape, not the fixture names', async () => {
	const result = await compile(
		'src/Rows.tsrx',
		`
import { element } from '@markless/core';

export function RowBar({ entries, pick }) @{
	const barEl = element<HTMLSpanElement>();

	<span el={barEl} onClick={() => {
		barEl?.setAttribute('data-pick', String(entries[pick].caption));
	}}>bar</span>
}
`,
	);

	const codes = result.captureAnalysis.diagnostics.map((diagnostic) => diagnostic.code);
	expect(codes).toContain(CAPTURE_OPAQUE_PROP_CODE);
	expect(
		result.captureAnalysis.diagnostics.map((diagnostic) => diagnostic.propName).sort(),
	).toEqual(['entries', 'pick']);
});

test('a plain dotted prop path still compiles and lowers to a capture read', async () => {
	const result = await compile(
		'src/Plain.tsrx',
		`
import { element } from '@markless/core';

export function Plain({ step }) @{
	const rootEl = element<HTMLDivElement>();

	<div el={rootEl} onClick={() => {
		rootEl?.setAttribute('data-label', step.label);
	}}>plain</div>
}
`,
	);

	expect(result.captureAnalysis.diagnostics).toEqual([]);
	expect(symbolSources(result)).toContain('"prop:props", ["step", "label"]');
});
