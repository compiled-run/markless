import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import BadgePage from './badge-page.tsrx';

// The fix the static-expression warning names for a member read of a plain prop: call a module function with the prop.
afterEach(cleanup);

const badge = () => {
	const span = document.querySelector('main span');
	return `${span?.className}: ${span?.textContent}`;
};

async function classFollowsTheProp() {
	await expect.poll(badge).toBe('badge: Row 0');
	(document.querySelector('main button') as HTMLElement).click();
	await expect.poll(badge).toBe('badge odd: Row 1');
	(document.querySelector('main button') as HTMLElement).click();
	await expect.poll(badge).toBe('badge: Row 0');
}

test('CSR', async () => {
	await render(BadgePage);
	await classFollowsTheProp();
});

test('SSR', async () => {
	await renderSSR(BadgePage);
	await classFollowsTheProp();
});
