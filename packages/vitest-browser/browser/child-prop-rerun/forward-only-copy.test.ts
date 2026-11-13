import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../../src/index.ts';
import Deep from './deep.tsrx';

afterEach(cleanup);

// The served cells whose id is a component's own prop bag.
const servedPropBags = () =>
	[...document.querySelectorAll('script[type="markless/state"]')].flatMap((script) =>
		(JSON.parse(script.textContent ?? '{}').cells ?? []).flatMap((cell: { graphNodeId: string }) =>
			cell.graphNodeId.endsWith('prop:props') ? [cell.graphNodeId] : [],
		),
	);

// Every component between the page and the child only hands the route on, and every read of it follows the route,
// so none of them is served a copy of what it hands on.
test('components that only forward routed props are served no copy of them', async () => {
	await renderSSR(Deep);
	await expect.poll(() => document.querySelector('[data-note]')?.textContent ?? '').toContain('abc');
	expect(servedPropBags()).toEqual([]);
});
