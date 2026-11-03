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
	const html = source.indexOf('const marklessSsrHtml = marklessSsrRendered.html;');

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

// This shape used to have no derive to route: nothing in the markup named the
// factory computed, so the render never worked it out and there was no value to
// serve. A handler read is a reach of its own now, so the render derives it.
test('a computed only a handler reads is derived for that read, and served', async () => {
	const source = await ssr(`${FACTORY}
export function Thumb() @{
	const s = slider();

	<div data-thumb aria-valuenow={s.value}
		onKeyDown={() => { s.value = s.min + (s.percent / 100) * (s.max - s.min) + 1; }} />
}
`);

	expect(source).toContain('#slider/computed:percent",(({read})');
	expect(source).toContain(
		'marklessSsrServeComputed(marklessSsrPayloadState, marklessSsrRenderStateValues, ["shared:src/slider.tsrx#slider/computed:percent"]);',
	);
});

// Resume keys the served rows off the collection, so without a served value it derived the computed at startup.
test('a computed a keyed @for repeats is served, and a computed only markup reads is not', async () => {
	const source = await ssr(`
import { computed, state } from '@markless/core';

export function Hits() @{
	const search = state({ text: 'a', all: [{ id: 'x', title: 'ax' }, { id: 'y', title: 'by' }] });
	const hits = computed(() => search.all.filter((hit) => hit.title.includes(search.text)));
	const count = computed(() => hits.length);

	<ul data-count={count}>
		@for (const hit of hits; key hit.id) {
			<li>{hit.title}</li>
		}
	</ul>
}
`);

	// Served only for the @for, so a value the serializer refuses is left out rather than failing the render.
	expect(source).toContain(
		'marklessSsrServeComputed(marklessSsrPayloadState, marklessSsrRenderStateValues, ["computed:hits"], ["computed:hits"]);',
	);
});

test('a keyed @for computed a handler also reads is served as a handler read', async () => {
	const source = await ssr(`
import { computed, state } from '@markless/core';

export function Picks() @{
	const picks = state({ min: 1, all: [{ id: 'p', n: 1 }, { id: 'q', n: 2 }] });
	const kept = computed(() => picks.all.filter((pick) => pick.n >= picks.min));

	<ul onClick={() => (picks.min = kept.length)}>
		@for (const pick of kept; key pick.id) {
			<li>{pick.n}</li>
		}
	</ul>
}
`);

	expect(source).toContain(
		'marklessSsrServeComputed(marklessSsrPayloadState, marklessSsrRenderStateValues, ["computed:kept"]);',
	);
});

test('a CSR mount keeps the value of a computed a keyed @for repeats', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/rows.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function Rows() @{
	const list = state({ rows: [{ id: 'a' }, { id: 'b' }], skip: 'b' });
	const kept = computed(() => list.rows.filter((row) => row.id !== list.skip));
	const label = computed(() => list.skip.toUpperCase());

	<ol data-label={label}>
		@for (const row of kept; key row.id) {
			<li>{row.id}</li>
		}
	</ol>
}
`,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const definition = compiled.publicRenderModule.componentDefinitions.find(
		(candidate) => candidate.name === 'Rows',
	) as
		| {
				readonly servedComputedIndexes?: ReadonlyArray<number>;
				readonly state: { readonly computed: ReadonlyArray<{ readonly graphNodeId: string }> };
		  }
		| undefined;
	const served = (definition?.servedComputedIndexes ?? []).map(
		(index) => definition?.state.computed[index]?.graphNodeId,
	);

	expect(served).toEqual(['computed:kept']);
});
