import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A sync computed is not re-derived on resume until a dependency is WRITTEN, so a
// handler reading one before the first write answered undefined (NaN in the
// slider's arithmetic). The render already derived the value for the HTML; these
// pin that the value now travels in the payload, and that it travels ONLY for the
// computeds a handler actually reads.

const FACTORY = `
import { shared, state, computed } from '@markless/core';

export const slider = shared(() => {
	const s = state({ value: 20, min: 0, max: 100 });
	const percent = computed(() => ((s.value - s.min) / (s.max - s.min)) * 100);
	return { ...s, percent };
}, { scope: 'widget' });
`;

const HANDLER_READS_COMPUTED = `${FACTORY}
export function Thumb() @{
	const s = slider();
	const label = computed(() => \`\${s.percent}%\`);

	<div data-thumb aria-valuenow={s.value} data-pct={s.percent} data-label={label}
		onKeyDown={() => { s.value = s.min + (s.percent / 100) * (s.max - s.min) + 1; }} />
}
`;

const HANDLER_READS_NO_COMPUTED = `${FACTORY}
export function Thumb() @{
	const s = slider();

	<div data-thumb aria-valuenow={s.value} data-pct={s.percent}
		onKeyDown={() => { s.value = s.value + 1; }} />
}
`;

async function ssr(source: string) {
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
	].filter((diagnostic) => diagnostic.severity === 'error');
	expect(errors).toEqual([]);
	return compiled.publicRenderModule.ssrModuleSource ?? '';
}

test('the computed a handler reads is served, and the one it does not read is not', async () => {
	const source = await ssr(HANDLER_READS_COMPUTED);

	expect(source).toContain(
		'marklessSsrServeComputed(marklessSsrPayloadState, marklessSsrRenderStateValues, ["shared:src/slider.tsrx#slider/computed:percent"]);',
	);
	// `label` is rendered but no handler reads it, so it carries no served value.
	expect(source).not.toContain('"computed:label"]');
});

test('the serve pass runs after the render body, where every derive has happened', async () => {
	const source = await ssr(HANDLER_READS_COMPUTED);
	const derive = source.indexOf('#slider/computed:percent",(({read})');
	const serve = source.indexOf('marklessSsrServeComputed(');
	const html = source.indexOf('const html = marklessSsrRendered.html;');

	expect(derive).toBeGreaterThan(-1);
	expect(serve).toBeGreaterThan(derive);
	expect(html).toBeGreaterThan(serve);
});

test('a page whose handlers read no computed emits the module it emitted before', async () => {
	const source = await ssr(HANDLER_READS_NO_COMPUTED);

	expect(source).not.toContain('marklessSsrServeComputed');
	// Pay-per-use down to the import: the helper is not even named on this page.
	expect(source).toContain("import { marklessCloneState } from '@markless/web/fns/state';");
});

// The known limit of routing an EXISTING derive: when nothing in the markup reads
// the factory computed, the render never derives it, so there is no value to
// serve. Serving it would mean deriving it server-side purely for the payload.
test('a computed only a handler reads has no render derive to route, so none is served', async () => {
	const source = await ssr(`${FACTORY}
export function Thumb() @{
	const s = slider();

	<div data-thumb aria-valuenow={s.value}
		onKeyDown={() => { s.value = s.min + (s.percent / 100) * (s.max - s.min) + 1; }} />
}
`);

	expect(source).not.toContain('#slider/computed:percent",(({read})');
	expect(source).not.toContain('marklessSsrServeComputed');
});
