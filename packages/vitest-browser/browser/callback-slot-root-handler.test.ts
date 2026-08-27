import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/cbslot-page.tsrx';

// A callback stored on a shared() instance by the widget root must be reachable
// from the ROOT's own handler, not only from another part's. Both handlers call
// the same dispatching method, so a route that only works from the part means
// the copied method body resolved the slot against the wrong thing.
afterEach(() => cleanup());

function reads(container: ParentNode) {
	return {
		root: container.querySelector<HTMLElement>('[data-cbs-root]'),
		trigger: container.querySelector<HTMLButtonElement>('[data-cbs-trigger]'),
		hits: container.querySelector('[data-cbs-hits]'),
		seen: container.querySelector('[data-cbs-seen]'),
		calls: container.querySelector('[data-cbs-calls]'),
	};
}

function press(target: HTMLElement) {
	target.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
}

// The green contrast: the part's handler already reached the consumer.
async function expectThePartRouteReports(container: ParentNode) {
	const { trigger, hits, seen, calls } = reads(container);
	expect(trigger).not.toBeNull();
	await expect.poll(() => `${hits?.textContent}|${seen?.textContent}|${calls?.textContent}`).toBe(
		'0|none|0',
	);

	trigger?.click();
	await expect.poll(() => `${hits?.textContent}|${seen?.textContent}|${calls?.textContent}`).toBe(
		'1|on|1',
	);
}

async function expectTheRootRouteReports(container: ParentNode) {
	const { root, hits, seen, calls } = reads(container);
	expect(root).not.toBeNull();
	await expect.poll(() => `${hits?.textContent}|${seen?.textContent}|${calls?.textContent}`).toBe(
		'0|none|0',
	);

	press(root as HTMLElement);
	// The state moved, which proves the handler ran and the method body was
	// copied in; only the dispatch to the stored callback went missing.
	await expect.poll(() => hits?.textContent).toBe('1');
	await expect.poll(() => `${seen?.textContent}|${calls?.textContent}`).toBe('on|1');

	press(root as HTMLElement);
	await expect.poll(() => `${seen?.textContent}|${calls?.textContent}`).toBe('off|2');
}

test('CSR: the part route reports each change to the consumer', async () => {
	const screen = await render(Page);
	await expectThePartRouteReports(screen.container as HTMLElement);
});

test('SSR resume: the part route reports each change to the consumer', async () => {
	const screen = await renderSSR(Page);
	await expectThePartRouteReports(screen.container);
});

test('CSR: the widget root’s own handler reports each change to the consumer', async () => {
	const screen = await render(Page);
	await expectTheRootRouteReports(screen.container as HTMLElement);
});

test('SSR resume: the widget root’s own handler reports each change to the consumer', async () => {
	const screen = await renderSSR(Page);
	await expectTheRootRouteReports(screen.container);
});
