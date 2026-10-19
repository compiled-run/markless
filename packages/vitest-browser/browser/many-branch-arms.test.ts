import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import { App } from './fixtures/many-branch-arms.tsrx';

afterEach(cleanup);

// Pins that resume finds each @if arm's nodes from its own anchors: walking the page from its root once per branch made
// the first click on a page with many branches cost the page's size times its branch count.
test('resuming a page with many @if arms reads each arm from its anchors, not the whole page per arm', async () => {
	const screen = await renderSSR(App);
	const container = screen.container as HTMLElement;
	const nodes = container.getElementsByTagName('*').length + 1;
	const childNodes = Object.getOwnPropertyDescriptor(Node.prototype, 'childNodes')!;
	let reads = 0;
	Object.defineProperty(Node.prototype, 'childNodes', {
		configurable: true,
		get(this: Node) {
			reads++;
			return childNodes.get!.call(this);
		},
	});
	try {
		container.querySelector<HTMLButtonElement>('[data-wake]')!.click();
		await expect.poll(() => container.querySelector('[data-picked]')!.textContent).toBe('wake');
	} finally {
		Object.defineProperty(Node.prototype, 'childNodes', childNodes);
	}
	expect(reads).toBeLessThan(nodes * 8);

	container.querySelector<HTMLButtonElement>('[data-arm="17"]')!.click();
	await expect.poll(() => container.querySelector('[data-picked]')!.textContent).toBe('17');
	container.querySelector<HTMLButtonElement>('[data-arm="3"]')!.click();
	await expect.poll(() => container.querySelector('[data-picked]')!.textContent).toBe('3');
});
