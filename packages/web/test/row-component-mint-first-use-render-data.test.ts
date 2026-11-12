import { expect, test } from 'vitest';
import { marklessRowComponentMint } from '../src/fns/row-component-mint.ts';
import type { PrerenderDataSurface } from '../src/prerender/evaluator.ts';

const page = {
	rootComponentName: null,
	components: {},
	imports: {},
} as unknown as PrerenderDataSurface;

const repeat = {
	id: 'repeat:0',
	keyPath: ['id'],
	itemName: 'item',
	collectionGraphNodeId: 'state:rows',
	collectionPath: [],
	rowComponent: { componentName: 'Card' },
} as never;

function mintFor(renderData: () => PrerenderDataSurface, rows: unknown[]) {
	return marklessRowComponentMint(renderData, { read: () => rows } as never, {
		runtimeInput: { loadSymbol: () => undefined, root: {} },
		armRegistrationDeps: async () => ({}),
		installArmEventType: () => undefined,
		elementsByHostId: new Map(),
	} as never);
}

test("loading the row mint leaves the page's render data unevaluated", () => {
	let evaluated = 0;
	mintFor(() => (evaluated++, page), [{ id: 'a' }]);
	expect(evaluated).toBe(0);
});

test("the first component-row build evaluates the page's render data", async () => {
	let evaluated = 0;
	const mint = mintFor(() => (evaluated++, page), [{ id: 'a' }]);
	await Promise.resolve(mint.rows(repeat, {} as never, new Map())).catch(() => undefined);
	expect(evaluated).toBe(1);
});
