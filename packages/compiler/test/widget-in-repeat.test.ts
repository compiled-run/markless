import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Spike T065. The build-time half of "can a widget family root be authored
// inside a keyed `@for`?". The compile is accepted in full - no diagnostic of
// any severity - and the artifact it produces is what the two render paths then
// fail on. The browser witness is packages/vitest-browser/browser/widget-in-repeat.test.ts.

const pageSource = `
import { state } from '@markless/core';
import * as rpt from './rpt.tsrx';

export default function RptPage() @{
	let rows = state([{ id: 'r1', on: true }, { id: 'r2', on: false }]);

	<section data-rpt-page>
		@for (const row of rows; key row.id) {
			<div data-row={row.id}>
				<rpt.Root checked={row.on}>
					<rpt.Trigger />
				</rpt.Root>
			</div>
		}
	</section>
}
`;

async function compilePage() {
	return compileTsrxModule({
		filename: 'src/RptPage.tsrx',
		source: pageSource,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

// Nothing refuses this shape at build time, so every failure it produces is a
// render-time one. A gate would belong here.
test('a widget root inside a keyed @for compiles with no diagnostic at all', async () => {
	const compiled = await compilePage();

	expect(compiled.semanticGraph.diagnostics).toEqual([]);
	expect(compiled.publicRenderModule.diagnostics ?? []).toEqual([]);
});

// The root's prop is left as authored source naming the ROW binding. The CSR
// prerender evaluator answers such a prop with no repeat item in scope, which is
// where `Cannot read properties of undefined` comes from.
test('the repeat-hosted root edge carries its prop as an opaque expression over the row binding', async () => {
	const compiled = await compilePage();
	const definition = compiled.publicRenderModule.componentDefinitions[0];
	const rootEdge = definition?.edges?.find((edge) => edge.childComponentName === 'rpt.Root');

	expect(rootEdge?.props).toEqual([{ name: 'checked', kind: 'opaque', source: 'row.on' }]);
});

// One prefix per EDGE, not per rendered row. Every iteration therefore reuses
// the same host ids (so a minted element() id repeats across rows) and the same
// symbol ids (so no row owns its own handlers).
test('the repeat-hosted edges get one build-time host and symbol prefix for every row', async () => {
	const compiled = await compilePage();
	const definition = compiled.publicRenderModule.componentDefinitions[0];
	const prefixes = (definition?.edges ?? []).map((edge) => [
		edge.childComponentName,
		edge.hostPrefix,
		edge.symbolPrefix,
	]);

	expect(prefixes).toEqual([
		['rpt.Root', 'c0:', 'c0:'],
		['rpt.Trigger', 'c1:', 'c0:p1:'],
	]);
});
