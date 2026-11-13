import { afterEach, expect, test } from 'vitest';
import { cleanup, renderServerHTML, renderStream } from '../../src/index.ts';
import ShelvesPage from './shelves-page.tsrx';
import TickingPage from './ticking-page.tsrx';

// Answers the server streams after its first flush are shown without the runtime; it starts at the first interaction and adopts them.

afterEach(() => cleanup());

const WAIT = { timeout: 3_000, interval: 10 };
type Host = HTMLElement & { __asyncResumeRuntimeStarted?: unknown };

function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes))
				script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

async function mountStreamed(stream: { readonly shell: string; readonly appends: ReadonlyArray<string> }) {
	expect(stream.appends.length).toBeGreaterThan(0);
	(globalThis as { browserRuns?: number }).browserRuns = 0;
	const { container } = renderServerHTML(stream.shell);
	for (const chunk of stream.appends) appendStreamed(container, chunk);
	return container.querySelector<Host>('[data-async-container]')!;
}

const titles = (shelf: string) =>
	Array.from(document.querySelectorAll(`[data-shelf="${shelf}"] .books li`), (item) => item.textContent);
const idle = () => new Promise<void>((done) => requestIdleCallback(() => setTimeout(done, 50), { timeout: 500 }));

test('streamed answers show with no interaction, and the runtime stays asleep', async () => {
	const root = await mountStreamed(await renderStream(ShelvesPage));
	await expect.poll(() => titles('all'), WAIT).toEqual(['Dune', 'Emma', 'Ulysses']);
	await expect.poll(() => document.querySelector('[data-shelf="remote"] .failed')?.textContent ?? '', WAIT).toContain('shelf offline');
	await idle();
	await idle();
	expect(root.__asyncResumeRuntimeStarted).toBeFalsy();
	expect((globalThis as { browserRuns?: number }).browserRuns).toBe(0);
});

test('the first click applies and keeps the streamed lists without running them again', async () => {
	await mountStreamed(await renderStream(ShelvesPage));
	await expect.poll(() => titles('all'), WAIT).toEqual(['Dune', 'Emma', 'Ulysses']);
	document.querySelector<HTMLButtonElement>('.tap')!.click();
	await expect.poll(() => document.querySelector('.tap')?.textContent, WAIT).toBe('1');
	expect(titles('all')).toEqual(['Dune', 'Emma', 'Ulysses']);
	expect((globalThis as { browserRuns?: number }).browserRuns).toBe(0);
});

test('a refresh, a reset and a save work from the adopted lists', async () => {
	await mountStreamed(await renderStream(ShelvesPage));
	await expect.poll(() => titles('all'), WAIT).toEqual(['Dune', 'Emma', 'Ulysses']);
	document.querySelector<HTMLButtonElement>('[data-shelf="all"] .filter')!.click();
	await expect.poll(() => titles('all'), WAIT).toEqual(['Dune']);
	document.querySelector<HTMLButtonElement>('[data-shelf="all"] .filter')!.click();
	await expect.poll(() => titles('all'), WAIT).toEqual(['Dune', 'Emma', 'Ulysses']);
	document.querySelector<HTMLButtonElement>('[data-shelf="remote"] .retry')!.click();
	await expect.poll(() => titles('remote'), WAIT).toEqual(['Dune', 'Emma', 'Ulysses']);
	document.querySelector<HTMLButtonElement>('[data-shelf="all"] .save')!.click();
	await expect.poll(() => titles('all'), WAIT).toContain('Middlemarch');
});

test('a press before the streamed answers land is applied, and the answers still show', async () => {
	const stream = await renderStream(ShelvesPage);
	const { container } = renderServerHTML(stream.shell);
	document.querySelector<HTMLButtonElement>('.tap')!.click();
	for (const chunk of stream.appends) appendStreamed(container, chunk);
	await expect.poll(() => document.querySelector('.tap')?.textContent, WAIT).toBe('1');
	await expect.poll(() => titles('all'), WAIT).toEqual(['Dune', 'Emma', 'Ulysses']);
});

test('a repeating timer started at idle keeps refreshing with no interaction', async () => {
	await mountStreamed(await renderStream(TickingPage));
	await expect.poll(() => Number(document.querySelector('.ticks')?.textContent), { timeout: 5_000 }).toBeGreaterThan(2);
	expect(titles('all')).toEqual(['Dune', 'Emma', 'Ulysses']);
});
