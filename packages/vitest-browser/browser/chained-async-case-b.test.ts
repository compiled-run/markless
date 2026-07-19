import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSRPhased } from '../src/index.ts';
import ForwardForge from './fixtures/chained-async-forge-forward.tsrx';

afterEach(() => cleanup());

test('SSR: ordered template demand settles both levels of an async computed chain', async () => {
	const server = await renderSSRPhased(ForwardForge);
	const document = serverDocument(server.html);

	expect(document.querySelector('[data-assay-arm]')?.textContent).toBe('refined-copper');
	expect(document.querySelector('[data-seal-arm]')?.textContent).toBe('Seal refined-copper');
	expect(document.querySelector('[data-seal-arm]')?.textContent).not.toBe('Seal cracked');
});

test('cold CSR: a chained downstream boundary goes pending then fulfilled with no catch frame', async () => {
	(globalThis as any).__forwardForgeRuns = { makerSeal: 0 };
	const screen = await render(ForwardForge);
	const container = screen.container as HTMLElement;
	const samples: string[] = [];
	const observer = observeArm(container, samples);

	await expect
		.poll(() => container.querySelector('[data-seal-arm]')?.textContent)
		.toBe('Seal refined-copper');
	observer.disconnect();

	expect(samples).not.toContain('Seal cracked');
	expect((globalThis as any).__forwardForgeRuns.makerSeal).toBe(1);
});

test('resume: an earlier upstream boundary settles without catch flashes and revalidates', async () => {
	const server = await renderSSRPhased(ForwardForge);
	const container = window.document.createElement('div');
	document.body.appendChild(container);
	const samples: string[] = [];
	const observer = observeArm(container, samples);
	server.mount({ container });

	await expect
		.poll(() => container.querySelector('[data-seal-arm]')?.textContent)
		.toBe('Seal refined-copper');

	const change = container.querySelector<HTMLButtonElement>('button[data-change-ore]');
	if (!change) throw new Error('Expected the ore control in the resumed document.');
	change.click();
	await expect
		.poll(() => container.querySelector('[data-seal-arm]')?.textContent)
		.toBe('Seal refined-silver');
	observer.disconnect();

	expect(samples).not.toContain('Seal cracked');
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
