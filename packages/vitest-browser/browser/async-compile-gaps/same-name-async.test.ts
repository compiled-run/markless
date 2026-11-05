import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import SameNameAsync from './same-name-async.tsrx';

// Each @try settles on its own component's async value when same-file components share its name.

async function mailCycle(container: HTMLElement) {
	await expect.poll(() => container.querySelector('[data-inbox] span')?.textContent).toBe('inbox-1');
	await expect.poll(() => container.querySelector('[data-outbox] span')?.textContent).toBe('outbox-0');
	container.querySelector<HTMLButtonElement>('[data-round]')!.click();
	await expect.poll(() => container.querySelector('[data-inbox] span')?.textContent).toBe('inbox-2');
	expect(container.querySelector('[data-outbox] span')?.textContent).toBe('outbox-0');
}

test('CSR: same-file components with an async value of one name each settle their own @try', async () => {
	const screen = await render(SameNameAsync);
	await mailCycle(screen.container as HTMLElement);
});

test('SSR: same-file components with an async value of one name each settle their own @try', async () => {
	const screen = await renderSSR(SameNameAsync);
	await mailCycle(screen.container as HTMLElement);
});
