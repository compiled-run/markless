import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import CaptureIdentityPage from './page.tsrx';

// Capture analysis used to match captures by identifier text, so a handler that
// declared its own `loud` made the markup read of the component-scope `loud`
// unemittable. The page below could not be compiled at all before the fix; the
// clicks prove each handler still runs its own local.
afterEach(() => cleanup());

function text(container: ParentNode, mark: string) {
	return container.querySelector(`[data-${mark}]`)?.textContent;
}

async function expectFirstRender(container: ParentNode) {
	await expect.poll(() => text(container, 'loud')).toBe('QUIET');
}

async function expectHandlersUseTheirOwnLocal(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-local]')?.click();
	await expect.poll(() => text(container, 'seen')).toBe('quiet!');

	container.querySelector<HTMLButtonElement>('[data-nested]')?.click();
	await expect.poll(() => text(container, 'tally')).toBe('5');
}

async function expectMarkupTracksTheComputed(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-shout]')?.click();
	await expect.poll(() => text(container, 'loud')).toBe('LOUDER');
}

test('CSR: markup shows the component computed a handler local shadows', async () => {
	const screen = await render(CaptureIdentityPage);
	await expectFirstRender(screen.container as HTMLElement);
});

test('CSR: each handler runs its own local and the markup re-derives', async () => {
	const screen = await render(CaptureIdentityPage);
	await expectFirstRender(screen.container as HTMLElement);
	await expectHandlersUseTheirOwnLocal(screen.container as HTMLElement);
	await expectMarkupTracksTheComputed(screen.container as HTMLElement);
});

test('SSR: markup shows the component computed a handler local shadows', async () => {
	const screen = await renderSSR(CaptureIdentityPage);
	await expectFirstRender(screen.container);
});

test('SSR resume: each handler runs its own local and the markup re-derives', async () => {
	const screen = await renderSSR(CaptureIdentityPage);
	await expectFirstRender(screen.container);
	await expectHandlersUseTheirOwnLocal(screen.container);
	await expectMarkupTracksTheComputed(screen.container);
});
