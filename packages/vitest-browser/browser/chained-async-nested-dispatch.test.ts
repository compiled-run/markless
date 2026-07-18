import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import NestedDispatch from './fixtures/chained-async-nested-dispatch.tsrx';

afterEach(() => cleanup());

test('SSR settles a hidden nested-object dependency behind the document second boundary', async () => {
	const server = await renderSSRPhased(NestedDispatch);
	const document = serverDocument(server.html);

	expect(document.querySelector('[data-checkpoint-arm]')?.textContent).toBe('Checkpoint open');
	expect(document.querySelector('[data-docket-arm]')?.textContent).toBe('Manifest lot-4');
});

test('resume reads a two-segment hidden dependency without a catch frame and revalidates numerically', async () => {
	const server = await renderSSRPhased(NestedDispatch);
	const container = window.document.createElement('div');
	document.body.appendChild(container);
	const samples: string[] = [];
	const observer = observeRecords(container, samples);
	server.mount({ container });

	await expect
		.poll(() => container.querySelector('[data-docket-arm]')?.textContent)
		.toBe('Manifest lot-4');
	const change = container.querySelector<HTMLButtonElement>('button[data-advance-lot]');
	if (!change) throw new Error('Expected the lot control.');
	change.click();
	await expect
		.poll(() => container.querySelector('[data-docket-arm]')?.textContent)
		.toBe('Manifest lot-7');
	observer.disconnect();

	expect(samples).not.toContain('Dispatch refused');
	container.remove();
});

function serverDocument(html: string): DocumentFragment {
	const template = window.document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

function observeRecords(container: HTMLElement, samples: string[]): MutationObserver {
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'characterData' && record.target.textContent !== null) {
				samples.push(record.target.textContent);
			}
			for (const node of record.addedNodes) {
				if (node.textContent) samples.push(node.textContent);
			}
		}
	});
	observer.observe(container, { characterData: true, childList: true, subtree: true });
	return observer;
}
