import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Two widget families in one module, each declaring a handle of the same name: a
// reference to the second family's handle must name that family's node and the
// element its own part binds, not the first family's namesake.

async function idrefs(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/families.tsrx', source, symbols: [] });
	const hosts = new Map(compiled.semanticGraph.elementHandleBindings.map((binding) => [binding.hostNodeId, binding.componentName]));
	return {
		diagnostics: compiled.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
		records: compiled.semanticGraph.elementHandleIdrefs.map((record) => ({
			attribute: record.attributeName,
			reader: record.componentName,
			handle: record.handleGraphNodeId,
			boundIn: hosts.get(record.boundHostNodeId),
		})),
	};
}

const twoFamilies = `
import { element, shared, state } from '@markless/core';

export const sheetState = shared(() => {
	const s = state({ open: false });
	const panelEl = element();
	const headingEl = element();
	return { ...s, panelEl, headingEl };
}, { scope: 'widget' });

export const noticeState = shared(() => {
	const n = state({ open: false });
	const panelEl = element();
	const headingEl = element();
	return { ...n, panelEl, headingEl };
}, { scope: 'widget' });

export function SheetRoot({ children }) @{
	const s = sheetState();
	s.open = false;
	<>{children}</>
}

export function SheetPanel({ children }) @{
	const s = sheetState();
	<section el={s.panelEl} aria-labelledby={s.headingEl}>{children}</section>
}

export function SheetHeading({ children }) @{
	const s = sheetState();
	<h2 el={s.headingEl}>{children}</h2>
}

export function NoticeRoot({ children }) @{
	const n = noticeState();
	n.open = false;
	<>{children}</>
}

export function NoticeOpener({ children }) @{
	const n = noticeState();
	<button aria-controls={n.panelEl}>{children}</button>
}

export function NoticePanel({ children }) @{
	const n = noticeState();
	<aside el={n.panelEl} aria-labelledby={n.headingEl}>{children}</aside>
}

export function NoticeHeading({ children }) @{
	const n = noticeState();
	<strong el={n.headingEl}>{children}</strong>
}
`;

test('a reference to the second family names that family and the part that binds it there', async () => {
	const { diagnostics, records } = await idrefs(twoFamilies);
	expect(diagnostics).not.toContain('MARKLESS_ELEMENT_HANDLE_DUPLICATE');
	expect(records).toEqual(
		expect.arrayContaining([
			{ attribute: 'aria-labelledby', reader: 'SheetPanel', handle: 'shared:src/families.tsrx#sheetState/element:headingEl', boundIn: 'SheetHeading' },
			{ attribute: 'aria-controls', reader: 'NoticeOpener', handle: 'shared:src/families.tsrx#noticeState/element:panelEl', boundIn: 'NoticePanel' },
			{ attribute: 'aria-labelledby', reader: 'NoticePanel', handle: 'shared:src/families.tsrx#noticeState/element:headingEl', boundIn: 'NoticeHeading' },
		]),
	);
	expect(records).toHaveLength(3);
});
