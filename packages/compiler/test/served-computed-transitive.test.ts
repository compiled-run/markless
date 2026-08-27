import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A factory `computed()` is derived server-side for the component that reaches
// it, not only for the one whose markup names it: a part-local `computed()`, a
// template expression, and a handler all reach it. Reached without a derive, it
// reconstructed as undefined and the attribute reading it dropped from the HTML.

const FACTORY = `
import { shared, state, computed } from '@markless/core';

export const slider = shared(() => {
	const s = state({ seed: 20, written: -1, min: 0, max: 100 });
	const start = computed(() => (s.written < 0 ? s.seed : s.written));
	const span = computed(() => s.max - s.min);
	return { ...s, start, span };
}, { scope: 'widget' });
`;

const START_DERIVE =
	'marklessSsrRenderStateValues.set("shared:src/slider.tsrx#slider/computed:start",(({read})';
const SPAN_DERIVE =
	'marklessSsrRenderStateValues.set("shared:src/slider.tsrx#slider/computed:span",(({read})';
const START_SERVE =
	'marklessSsrServeComputed(marklessSsrPayloadState, marklessSsrRenderStateValues, ["shared:src/slider.tsrx#slider/computed:start"]);';

async function compile(source: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/slider.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const errors = [
		...compiled.semanticGraph.diagnostics,
		...compiled.stateLowering.diagnostics,
		...compiled.publicRenderModule.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
	return { compiled, errors };
}

async function ssr(source: string) {
	const { compiled, errors } = await compile(source);
	expect(errors).toEqual([]);
	return compiled.publicRenderModule.ssrModuleSource ?? '';
}

test('a factory computed only a part-local computed reads still derives and is served', async () => {
	const source = await ssr(`${FACTORY}
export function Thumb() @{
	const s = slider();
	const now = computed(() => s.start);

	<div data-thumb aria-valuenow={now}
		onKeyDown={() => { s.written = s.start + 1; }} />
}
`);

	expect(source).toContain(START_DERIVE);
	expect(source).toContain(START_SERVE);
	// Nothing reads `span`, so nothing derives it: reachability, not membership
	// of the instance the prelude rebuilds.
	expect(source).not.toContain(SPAN_DERIVE);
});

test('a factory computed a template expression reads derives', async () => {
	const source = await ssr(`${FACTORY}
export function Thumb() @{
	const s = slider();

	<div data-thumb aria-valuenow={s.start + s.min} />
}
`);

	expect(source).toContain(START_DERIVE);
});

test('a factory computed only a handler reads is now derived and served', async () => {
	const source = await ssr(`${FACTORY}
export function Thumb() @{
	const s = slider();

	<div data-thumb aria-valuenow={s.seed}
		onKeyDown={() => { s.written = s.start + 1; }} />
}
`);

	expect(source).toContain(START_DERIVE);
	expect(source).toContain(START_SERVE);
});

test('a factory computed feeding another derives first', async () => {
	const source = await ssr(`
import { shared, state, computed } from '@markless/core';

export const slider = shared(() => {
	const s = state({ seed: 20, min: 0, max: 100 });
	const span = computed(() => s.max - s.min);
	const fraction = computed(() => (s.seed - s.min) / span);
	return { ...s, span, fraction };
}, { scope: 'widget' });

export function Thumb() @{
	const s = slider();
	const pct = computed(() => s.fraction * 100);

	<div data-thumb aria-valuenow={pct} />
}
`);

	const span = source.indexOf('"shared:src/slider.tsrx#slider/computed:span",(({read})');
	const fraction = source.indexOf('"shared:src/slider.tsrx#slider/computed:fraction",(({read})');

	expect(span).toBeGreaterThan(-1);
	expect(fraction).toBeGreaterThan(span);
});

test('a page whose reads reach no factory computed emits no derive and no serve', async () => {
	const source = await ssr(`${FACTORY}
export function Thumb() @{
	const s = slider();

	<div data-thumb aria-valuenow={s.seed}
		onKeyDown={() => { s.written = s.seed + 1; }} />
}
`);

	expect(source).not.toContain(START_DERIVE);
	expect(source).not.toContain(SPAN_DERIVE);
	expect(source).not.toContain('marklessSsrServeComputed');
});

test('a loop of factory computeds is named rather than served as undefined', async () => {
	const { compiled } = await compile(`
import { shared, state, computed } from '@markless/core';

export const slider = shared(() => {
	const s = state({ seed: 20 });
	const left = computed(() => right + s.seed);
	const right = computed(() => left - s.seed);
	return { ...s, left, right };
}, { scope: 'widget' });

export function Thumb() @{
	const s = slider();

	<div data-thumb aria-valuenow={s.left} />
}
`);

	const cycles = compiled.publicRenderModule.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_SERVER_DERIVE_UNREACHABLE',
	);
	expect(cycles.length).toBeGreaterThan(0);
	expect(cycles.every((diagnostic) => diagnostic.severity === 'error')).toBe(true);
});
