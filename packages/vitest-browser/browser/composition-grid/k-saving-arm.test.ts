import { beforeEach, expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import { boardRequest, installServer, release, resetServer, saveRequest, waitingRequests } from './grid-server.ts';
import SavingArmPage from './k-saving-arm-page.tsrx';
import { lines } from './timeline.ts';

// A save's handler opens an @if holding a component from another file, inside the @try whose value the save reloads.
installServer();
beforeEach(resetServer);

const poll = { timeout: 4_000, interval: 10 };
const loaded = ['title.even: a round 0', 'row: a one', 'row: a two'];

async function answer(request: string) {
	await expect.poll(waitingRequests, poll).toContain(request);
	release(request);
}

for (const [mode, mount] of [
	['CSR', () => render(SavingArmPage)],
	['SSR', () => renderSSR(SavingArmPage)],
] as const)
	test(`${mode}: the component arm shows while the save and its reload are held, then gives way to the saved row`, async () => {
		const errors: string[] = [];
		const onError = (event: ErrorEvent) => errors.push(String(event.error ?? event.message));
		const onRejection = (event: PromiseRejectionEvent) => errors.push(String(event.reason));
		window.addEventListener('error', onError);
		window.addEventListener('unhandledrejection', onRejection);
		try {
			await mount();
			if (mode === 'CSR') await answer(boardRequest('a', 0));
			await expect.poll(() => lines(), poll).toEqual(loaded);
			document.querySelector<HTMLElement>('[data-grid-save]')!.click();
			await expect.poll(waitingRequests, poll).toContain(saveRequest('a'));
			await expect.poll(() => lines(), poll).toEqual([...loaded, 'saving: a']);
			await answer(saveRequest('a'));
			await expect.poll(waitingRequests, poll).toContain(boardRequest('a', 0));
			expect(lines()).toEqual([...loaded, 'saving: a']);
			release(boardRequest('a', 0));
			await expect.poll(() => lines(), poll).toEqual([...loaded, 'row: a saved 1']);
			expect(errors).toEqual([]);
		} finally {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
		}
	});
