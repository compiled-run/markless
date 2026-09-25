import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vite-plus/test/browser';
import { cleanup, renderSSR } from '../src/index.ts';
import LeavingLinkWakePage from './fixtures/leaving-link-wake.tsrx';

afterEach(() => cleanup());

type ServedRoot = HTMLElement & { __marklessDelegatedDispatch?: boolean };

async function servedPage() {
	const screen = await renderSSR(LeavingLinkWakePage);
	const root = screen.container.querySelector<ServedRoot>('[data-async-container]');
	if (!root) throw new Error('Expected a served container.');
	const find = (selector: string) => {
		const element = root.querySelector<HTMLElement>(selector);
		if (!element) throw new Error(`Expected "${selector}" in the served DOM.`);
		return element;
	};
	return { root, find };
}

async function settle(): Promise<void> {
	for (let frame = 0; frame < 3; frame++)
		await new Promise((resolve) => requestAnimationFrame(resolve));
}

// A page with row handlers hands unknown clicks to its runtime; a link that leaves the page must not start it.
test('a plain navigation link outside the rows leaves the page runtime asleep', async () => {
	const { root, find } = await servedPage();

	await userEvent.click(page.elementLocator(find('[data-leave]')));
	await settle();

	expect(root.__marklessDelegatedDispatch).toBeUndefined();
});

test('a link with its own click handler still dispatches', async () => {
	const { find } = await servedPage();

	await userEvent.click(page.elementLocator(find('[data-handled]')));

	await expect.poll(() => find('[data-handled-count]').textContent).toBe('1');
});

test('a link inside a row still reaches the row handler', async () => {
	const { find } = await servedPage();

	await userEvent.click(page.elementLocator(find('[data-row-link]')));

	await expect.poll(() => find('[data-picked]').textContent).toBe('alpha');
});

test('a router link the router prevented to navigate leaves the page runtime asleep', async () => {
	const { root, find } = await servedPage();
	const route = (event: Event) => event.preventDefault();
	document.addEventListener('click', route, true);
	try {
		find('[data-routed]').click();
		await settle();
		expect(root.__marklessDelegatedDispatch).toBeUndefined();
	} finally {
		document.removeEventListener('click', route, true);
	}
});

test('a plain link whose default was already prevented still wakes the page', async () => {
	const { root, find } = await servedPage();
	const prevent = (event: Event) => event.preventDefault();
	document.addEventListener('click', prevent, true);
	try {
		find('[data-leave]').click();
		await expect.poll(() => root.__marklessDelegatedDispatch).toBe(true);
	} finally {
		document.removeEventListener('click', prevent, true);
	}
});
