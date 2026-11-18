import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { CallbackJoinForm } from './callback-join-form.tsrx';
import { JoinForm } from './join-form.tsrx';
import { ShelfJoinForm } from './shelf-join-form.tsrx';

// A submit button's author-written aria-disabled, from state the handler writes before its first await, paints with the form's aria-busy.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

type Marks = { busy: boolean; disabled: boolean; status?: boolean };

// Counts animation frames, and notes the frame of every DOM change and every frame or task end at which the form and the button disagree.
function watchFrames(container: HTMLElement) {
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const join = container.querySelector<HTMLButtonElement>('[data-join]')!;
	const status = container.querySelector('[data-status]');
	const marks = (): Marks => ({
		busy: form.getAttribute('aria-busy') === 'true',
		disabled: join.getAttribute('aria-disabled') === 'true',
		...(status && { status: status.textContent === 'Sending' }),
	});
	const agree = (now: Marks) => now.busy === now.disabled && (now.status ?? now.busy) === now.busy;
	let frame = 0;
	let counting = true;
	const apart: string[] = [];
	const changes: Array<Marks & { frame: number }> = [];
	const tick = () => {
		const now = marks();
		if (!agree(now)) apart.push(`frame ${frame}: ${JSON.stringify(now)}`);
		frame++;
		if (counting) requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const tasks = new MessageChannel();
	tasks.port1.onmessage = () => {
		const now = marks();
		if (!agree(now)) apart.push(`a task in frame ${frame}: ${JSON.stringify(now)}`);
		if (counting) tasks.port2.postMessage(0);
	};
	tasks.port2.postMessage(0);
	const observer = new MutationObserver(() => {
		const now = marks();
		const last = changes.at(-1);
		if (!last || last.busy !== now.busy || last.disabled !== now.disabled || last.status !== now.status) changes.push({ frame, ...now });
	});
	observer.observe(container, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-busy', 'aria-disabled'] });
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
	if (changes[0]?.status !== undefined) expect(firstFrame(changes, 'status', true)).toBe(firstFrame(changes, 'busy', true));
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

test('client-rendered, a cold callback prop written before the first await: its write lands with both marks', async () => {
	const container = (await render(CallbackJoinForm)).container as HTMLElement;
	await joinsInOneFrame(container);
});

test('server-rendered, a cold callback prop written before the first await: its write lands with both marks', async () => {
	const { container } = await renderSSR(CallbackJoinForm);
	await joinsInOneFrame(container as HTMLElement);
});

// The button's update code is loaded first, so only the callback's code is still cold when the form is sent.
async function warmed(container: HTMLElement) {
	const join = container.querySelector('[data-join]')!;
	const warm = container.querySelector<HTMLButtonElement>('[data-warm]')!;
	warm.click();
	await expect.poll(() => join.getAttribute('aria-disabled'), poll).toBe('true');
	warm.click();
	await expect.poll(() => join.hasAttribute('aria-disabled'), poll).toBe(false);
	return container;
}

test('client-rendered, a callback prop whose code alone is cold: its write lands with both marks', async () => {
	const container = await warmed((await render(CallbackJoinForm)).container as HTMLElement);
	await joinsInOneFrame(container);
	expect(container.querySelector('[data-status]')!.textContent).toBe('');
});

test('server-rendered, a callback prop whose code alone is cold: its write lands with both marks', async () => {
	const container = await warmed((await renderSSR(CallbackJoinForm)).container as HTMLElement);
	await joinsInOneFrame(container);
	expect(container.querySelector('[data-status]')!.textContent).toBe('');
});
