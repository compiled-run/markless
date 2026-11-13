import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, renderServerHTML, renderStream } from '../../src/index.ts';
import { poll } from '../back-revalidate/support.ts';
import { installServer, server } from '../mutations-refresh/server.ts';
import StreamedPlainForm from './streamed-plain-form.tsrx';

// Alone in its file, so the press is the first thing that loads the code a submit runs.
installServer();
afterEach(() => cleanup());

test('SSR stream: a real click on a streamed plain form before any submit code has loaded', async () => {
	let nativeSubmits = 0;
	const lastWord = (event: Event) => {
		if (!event.defaultPrevented) nativeSubmits++;
		event.preventDefault();
	};
	document.addEventListener('submit', () => window.addEventListener('submit', lastWord, { once: true }));
	server.lateGate = Promise.resolve();
	const { shell, appends } = await renderStream(StreamedPlainForm);
	const { container } = renderServerHTML(shell);
	for (const html of appends) {
		const holder = document.createElement('template');
		holder.innerHTML = html;
		for (const node of Array.from(holder.content.childNodes)) {
			if (node.nodeName !== 'SCRIPT') container.appendChild(node);
			else {
				const script = document.createElement('script');
				for (const attribute of Array.from((node as Element).attributes)) script.setAttribute(attribute.name, attribute.value);
				script.text = node.textContent ?? '';
				container.appendChild(script);
			}
		}
	}
	await expect.poll(() => container.querySelector('[data-names]')?.textContent ?? null, poll).toBe('Ada');
	await userEvent.fill(container.querySelector<HTMLElement>('[data-field]')!, 'Hopper');
	await userEvent.click(container.querySelector<HTMLElement>('[data-submit]')!);
	await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items name=Hopper']);
	await expect.poll(() => container.querySelector('[data-names]')!.textContent, poll).toBe('Ada, name=Hopper');
	await expect.poll(() => container.querySelector('[data-form]')!.hasAttribute('aria-busy'), poll).toBe(false);
	expect(nativeSubmits).toBe(0);
});
