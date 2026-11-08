import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

const PART = `import type { PropsOf } from '@markless/core';

export function Btn({ children, ...rest }: PropsOf<'button'>) @{
	<button {...rest} type="button">{children}</button>
}`;

const PAGE = `import { state } from '@markless/core';
import { Btn } from './btn.tsrx';

function Pick({ to }: { readonly to: string }) @{
	const page = state({ last: '' });
	<Btn data-pick={to} onClick={() => { page.last = to; }}>{to + page.last}</Btn>
}

function Plain() @{
	<Btn data-plain="">plain</Btn>
}

export default function Page() @{
	<main><Plain /><Pick to="dark" /></main>
}`;

test('a forwarded spread record names the component edge that stated it', async () => {
	const [, page] = await compileTsrxModulesWithInterfaces([
		{ filename: '/parts/btn.tsrx', source: PART, importSource: './btn.tsrx' },
		{ filename: '/pages/page.tsrx', source: PAGE },
	]);
	const edges = page!.semanticGraph.componentEdges;
	const pickEdge = edges.find((edge) => edge.parentComponentName === 'Pick')!;
	const plainEdge = edges.find((edge) => edge.parentComponentName === 'Plain')!;
	const view = page!.protocolView as unknown as Record<
		'events' | 'locators' | 'domUpdates' | 'elementHandles',
		ReadonlyArray<{ readonly hostNodeId: string; readonly componentEdgeId?: string }>
	>;

	// Both parts place Btn first, so both spell the button `c0:h0`; only the edge tells them apart.
	expect(view.events.filter((event) => event.hostNodeId === 'c0:h0')).toEqual([
		expect.objectContaining({ eventName: 'click', componentEdgeId: pickEdge.id }),
	]);
	expect(view.locators.filter((locator) => locator.hostNodeId === 'c0:h0')).toEqual([
		expect.objectContaining({ componentEdgeId: pickEdge.id }),
	]);
	const records = [...view.events, ...view.locators, ...view.domUpdates, ...view.elementHandles];
	expect(records.some((record) => record.componentEdgeId === plainEdge.id)).toBe(false);
});
