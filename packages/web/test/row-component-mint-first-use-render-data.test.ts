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

function mintFor(
	renderData: () => PrerenderDataSurface | Promise<PrerenderDataSurface>,
	rows: unknown[],
	disposed = () => false,
) {
	return marklessRowComponentMint(renderData, { read: () => rows } as never, {
		runtimeInput: { loadSymbol: () => undefined, root: {} },
		armRegistrationDeps: async () => ({}),
		installArmEventType: () => undefined,
		elementsByHostId: new Map(),
		disposed,
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

test('a container disposed while its first build waits for the render data builds no row', async () => {
	let disposed = false;
	let answer!: (surface: PrerenderDataSurface) => void;
	const mint = mintFor(
		() => new Promise<PrerenderDataSurface>((done) => (answer = done)),
		[{ id: 'a' }],
		() => disposed,
	);
	const building = Promise.resolve(mint.rows(repeat, {} as never, new Map()));
	disposed = true;
	answer(page);
	const commit = await building;
	await commit();
	expect(mint.mintRow({} as never, repeat, { id: 'a' })).toBeUndefined();
});
