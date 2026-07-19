import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import HiddenOrchard from './fixtures/chained-async-orchard-hidden.tsrx';

afterEach(() => cleanup());

test('SSR: a demanded downstream async computed also settles its non-template-read upstream', async () => {
	const server = await renderSSRPhased(HiddenOrchard);
	const document = serverDocument(server.html);

	expect(document.querySelector('[data-canopy-arm]')?.textContent).toBe('Canopy cedar-sap');
	expect(document.querySelector('[data-canopy-arm]')?.textContent).not.toBe('Withered');
});

test('resume: a hidden upstream settles without a catch frame and revalidates downstream', async () => {
	const server = await renderSSRPhased(HiddenOrchard);
	const container = window.document.createElement('div');
	document.body.appendChild(container);
	const samples: string[] = [];
	const observer = observeArm(container, samples);
	server.mount({ container });

	await expect
		.poll(() => container.querySelector('[data-canopy-arm]')?.textContent)
		.toBe('Canopy cedar-sap');

	const change = container.querySelector<HTMLButtonElement>('button[data-change-cultivar]');
	if (!change) throw new Error('Expected the cultivar control in the resumed document.');
	change.click();
	await expect
		.poll(() => container.querySelector('[data-canopy-arm]')?.textContent)
		.toBe('Canopy birch-sap');
	observer.disconnect();

	expect(samples).not.toContain('Withered');
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
