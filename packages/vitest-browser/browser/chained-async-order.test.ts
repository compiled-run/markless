import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import ReverseTides from './fixtures/chained-async-tides-reverse.tsrx';

afterEach(() => cleanup());

test('SSR: a downstream boundary settles even when it precedes its upstream boundary', async () => {
	const server = await renderSSRPhased(ReverseTides);
	const document = serverDocument(server.html);

	expect(document.querySelector('[data-passage-arm]')?.textContent).toBe('Passage north-east');
	expect(document.querySelector('[data-passage-arm]')?.textContent).not.toBe('Route lost');
	expect(document.querySelector('[data-tide-arm]')?.textContent).toBe('north-east');
});

test('resume: reversed boundary order has no catch frame and preserves chained revalidation', async () => {
	const server = await renderSSRPhased(ReverseTides);
	const container = window.document.createElement('div');
	document.body.appendChild(container);
	const samples: string[] = [];
	const observer = observeArm(container, samples);
	server.mount({ container });

	await expect
		.poll(() => container.querySelector('[data-passage-arm]')?.textContent)
		.toBe('Passage north-east');

	const change = container.querySelector<HTMLButtonElement>('button[data-change-harbor]');
	if (!change) throw new Error('Expected the harbor control in the resumed document.');
	change.click();
	await expect
		.poll(() => container.querySelector('[data-passage-arm]')?.textContent)
		.toBe('Passage south-east');
	observer.disconnect();

	expect(samples).not.toContain('Route lost');
	container.remove();
});

function serverDocument(html: string): DocumentFragment {
	const template = window.document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

function observeArm(container: HTMLElement, samples: string[]): MutationObserver {
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'characterData') {
				const text = record.target.textContent;
				if (text !== null) samples.push(text);
			}
			for (const node of record.addedNodes) {
				const text = node.textContent;
				if (text) samples.push(text);
			}
		}
	});
	observer.observe(container, { characterData: true, childList: true, subtree: true });
	return observer;
}
