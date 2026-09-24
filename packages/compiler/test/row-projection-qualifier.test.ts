import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A keyed row's projected elements are located per row, so the owner's records
// for them are copied per row at composition. Only an owner whose rows project
// elements names the qualifier; every other page ships none of it.
async function compile(rowBody: string) {
	const result = await compileTsrxModule({
		filename: '/w/src/list.tsrx',
		source: `
import { state } from '@markless/core';

function Slot({ label, children }) @{
	<li data-slot={label}>{children}</li>
}
export default function List() @{
	let taps = state(0);
	const rows = state([{ id: 'a' }, { id: 'b' }]);
	<ul>
		@for (const row of rows; key row.id) {
			${rowBody}
		}
		<output>{taps}</output>
	</ul>
}
`,
		symbols: [],
	});
	const definition = result.publicRenderModule.componentDefinitions.find(
		(entry) => entry.name === 'List',
	);
	return {
		ssr: result.publicRenderModule.ssrModuleSource,
		projectsIntoRows: definition?.projectsIntoRows === true,
	};
}

test('an owner whose rows project elements names the per-row qualifier', async () => {
	for (const rowBody of [
		'<Slot label={row.id}><i onClick={() => taps = taps + 1}>{row.id}</i></Slot>',
		'<Slot label={row.id}><section><b>{taps}</b></section></Slot>',
	]) {
		const compiled = await compile(rowBody);
		expect(compiled.projectsIntoRows).toBe(true);
		expect(compiled.ssr).toContain('marklessSsrRowQualifiedView(marklessSsrRendered.structure, payloadView');
		expect(compiled.ssr).toContain('projectionSegment:marklessRowProjectionSegment');
		expect(compiled.ssr).toContain("from '@markless/web/fns/row-qualified-view'");
	}
});

test('rows that project no element, or no row at all, carry no qualifier', async () => {
	for (const rowBody of [
		'<Slot label={row.id}>{row.id}</Slot>',
		'<Slot label={row.id} />',
		'<li onClick={() => taps = taps + 1}>{row.id}</li>',
	]) {
		const compiled = await compile(rowBody);
		expect(compiled.projectsIntoRows).toBe(false);
		expect(compiled.ssr).not.toContain('row-qualified-view');
	}
});
