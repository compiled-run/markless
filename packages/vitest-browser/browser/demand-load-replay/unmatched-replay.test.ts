import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './unmatched-page.tsrx';
import { parkPointerBeforeMount, settledCount, watchForThrows } from './counting.ts';

// A container that listens on behalf of rows forwards every click of that name,
// so a click on a plain element reaches the runtime with nothing to match. The
// gesture that opens the demand-load window and the one after it are the same
// gesture: whatever the second does silently, the first must do silently too.
afterEach(() => cleanup());

const Plain = page.getByTestId('unmatched-plain');
const Row = page.getByTestId('unmatched-row');
const HoverLabel = page.getByTestId('unmatched-hover-label');
const Picked = page.getByTestId('unmatched-picked');
const Enters = page.getByTestId('unmatched-enters');

test('SSR: an unmatched click inside the demand-load window is as quiet as one after it', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await renderSSR(Page);

		// First gesture on the page: captured before the runtime exists, replayed
		// once it lands, and named by no record when it gets there.
		await userEvent.click(Plain);
		// The runtime is up now, so a record still routes.
		await userEvent.click(Row);
		await expect.element(Picked).toHaveTextContent('alpha');

		// Same click again, this time straight through the live listener.
		await userEvent.click(Plain);
		await expect.element(Picked).toHaveTextContent('alpha');

		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('CSR: an unmatched click on a container that listens for rows passes through', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await render(Page);

		await userEvent.click(Plain);
		await userEvent.click(Row);
		await expect.element(Picked).toHaveTextContent('alpha');

		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: an unmatched non-bubbling gesture in the window leaves the record it belongs to alone', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await renderSSR(Page);

		// The pointer crosses the host that answers `pointerenter` and the plain
		// label under it, which answers nothing: one dispatch, no refusal.
		await userEvent.hover(HoverLabel);
		expect(await settledCount(() => Number(Enters.element().textContent))).toBe(1);

		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});
