import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { JoinForm } from './join-form.tsrx';
import { ShelfJoinForm } from './shelf-join-form.tsrx';

// A submit button's author-written aria-disabled, from state the handler writes before its first await, paints with the form's aria-busy.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

type Marks = { busy: boolean; disabled: boolean };

// Counts animation frames, and notes the frame of every DOM change and every frame or task end at which the form and the button disagree.
function watchFrames(container: HTMLElement) {
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const join = container.querySelector<HTMLButtonElement>('[data-join]')!;
	const marks = (): Marks => ({
		busy: form.getAttribute('aria-busy') === 'true',
		disabled: join.getAttribute('aria-disabled') === 'true',
	});
	let frame = 0;
	let counting = true;
	const apart: string[] = [];
	const changes: Array<Marks & { frame: number }> = [];
	const tick = () => {
		const now = marks();
		if (now.busy !== now.disabled) apart.push(`frame ${frame}: form busy ${now.busy}, Join aria-disabled ${now.disabled}`);
		frame++;
		if (counting) requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const tasks = new MessageChannel();
	tasks.port1.onmessage = () => {
		const now = marks();
		if (now.busy !== now.disabled) apart.push(`a task in frame ${frame}: form busy ${now.busy}, Join aria-disabled ${now.disabled}`);
		if (counting) tasks.port2.postMessage(0);
	};
	tasks.port2.postMessage(0);
	const observer = new MutationObserver(() => {
		const now = marks();
		const last = changes.at(-1);
		if (!last || last.busy !== now.busy || last.disabled !== now.disabled) changes.push({ frame, ...now });
	});
	observer.observe(container, { subtree: true, attributes: true, attributeFilter: ['aria-busy', 'aria-disabled'] });
	return {
		form,
		join,
		stop() {
			observer.disconnect();
			counting = false;
			tasks.port1.close();
			return { apart, changes };
		},
	};
}

const firstFrame = (changes: ReadonlyArray<Marks & { frame: number }>, mark: keyof Marks, on: boolean) =>
	changes.find((change) => change[mark] === on)?.frame;

async function joinsInOneFrame(container: HTMLElement) {
	const watch = watchFrames(container);
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	expect(watch.join.hasAttribute('aria-disabled')).toBe(false);
	watch.join.click();
	await expect.poll(() => watch.form.getAttribute('aria-busy'), poll).toBe('true');
	await expect.poll(() => watch.join.getAttribute('aria-disabled'), poll).toBe('true');
	answer.resolve();
	await expect.poll(() => watch.form.hasAttribute('aria-busy'), poll).toBe(false);
	await expect.poll(() => watch.join.hasAttribute('aria-disabled'), poll).toBe(false);
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	const { apart, changes } = watch.stop();
	expect(firstFrame(changes, 'disabled', true)).toBe(firstFrame(changes, 'busy', true));
	expect(apart).toEqual([]);
	expect(server.posts).toHaveLength(1);
}

test('client-rendered: the author aria-disabled and the form aria-busy appear in the same frame', async () => {
	const container = (await render(JoinForm)).container as HTMLElement;
	await joinsInOneFrame(container);
});

test('server-rendered: the author aria-disabled and the form aria-busy appear in the same frame', async () => {
	const { container } = await renderSSR(JoinForm);
	await joinsInOneFrame(container as HTMLElement);
});

test('client-rendered, a save that reloads data: both marks appear in the same frame', async () => {
	const container = (await render(ShelfJoinForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	await joinsInOneFrame(container);
	await shows(container, '[data-names]', 'Ada, Grace');
});

test('server-rendered, a save that reloads data: both marks appear in the same frame', async () => {
	const { container } = await renderSSR(ShelfJoinForm);
	await shows(container as HTMLElement, '[data-names]', 'Ada');
	await joinsInOneFrame(container as HTMLElement);
	await shows(container as HTMLElement, '[data-names]', 'Ada, Grace');
});
