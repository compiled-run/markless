import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows, text } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { Saves } from './saves.tsrx';

// A save sent from a handler marks what will load again, and the control that sent it, until that reload settles.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

type Screen = { readonly container: unknown; readonly runtime?: { readonly runtime?: unknown } };
const modes = [
	['CSR', () => render(Saves), 1],
	['SSR', () => renderSSR(Saves), 0],
] as const;

async function mounted(screen: Screen): Promise<HTMLElement> {
	await (
		screen.runtime?.runtime as { whenAsyncBoundariesSettled?: () => Promise<void> } | undefined
	)?.whenAsyncBoundariesSettled?.();
	const container = screen.container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	return container;
}

const reads = () => server.gets.filter((get) => get === '/mut/items').length;
const at = (container: ParentNode, selector: string) => {
	const element = container.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected ${selector} in the rendered DOM.`);
	return element;
};
const marked = (element: Element) => element.getAttribute('aria-busy') === 'true';
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const allClear = (container: ParentNode) =>
	expect.poll(() => container.querySelectorAll('[aria-busy]').length, poll).toBe(0);

// Every aria-busy state the element passes through, rebuilt from mutation records, with repeats collapsed.
function track(element: Element): () => boolean[] {
	const values: Array<string | null> = [];
	const observer = new MutationObserver((records) => {
		for (const record of records) values.push(record.oldValue);
	});
	observer.observe(element, {
		attributes: true,
		attributeFilter: ['aria-busy'],
		attributeOldValue: true,
	});
	return () => {
		for (const record of observer.takeRecords()) values.push(record.oldValue);
		observer.disconnect();
		const states = [...values, element.getAttribute('aria-busy')].map(
			(value) => value === 'true',
		);
		return states.filter((state, index) => index === 0 || state !== states[index - 1]);
	};
}

// Every line the shared announcer says from now until the test ends; reading does not stop it.
function listen(): () => string[] {
	const said: string[] = [];
	const region = () => document.querySelector('[data-markless-announcer]')?.textContent ?? '';
	let last = region();
	const observer = new MutationObserver(() => {
		if (region() !== last && region() !== '') said.push(region());
		last = region();
	});
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	listening.push(observer);
	return () => [...said];
}
const listening: MutationObserver[] = [];
afterEach(() => listening.splice(0).forEach((observer) => observer.disconnect()));

// The control's mark in the first frame after the page sends its next write; the content's mark lands with the flush after the send.
function sentAndMarked(names: Element, control: Element): () => Promise<void> {
	let controlAtFirstFrame: boolean | undefined;
	server.sent = () => {
		server.sent = undefined;
		requestAnimationFrame(() => (controlAtFirstFrame = marked(control)));
	};
	return async () => {
		await expect.poll(() => controlAtFirstFrame, poll).toBe(true);
		await expect.poll(() => marked(names), poll).toBe(true);
	};
}

async function savesAndRefreshes(
	container: HTMLElement,
	selector: string,
	readsBefore: number,
	shown: string,
	send = () => at(container, selector).click(),
) {
	const names = at(container, '[data-names]');
	const control = at(container, selector);
	const history = [track(names), track(control)];
	const answered = deferred<void>();
	const held = deferred<void>();
	server.nextPost = [{ wait: answered.promise }];
	server.holdReads = held.promise;
	const markedOnSend = sentAndMarked(names, control);

	send();
	await markedOnSend();
	expect(names.textContent).toBe('Ada');

	answered.resolve();
	await expect.poll(reads, poll).toBe(readsBefore + 1);
	expect([marked(names), marked(control)]).toEqual([true, true]);
	expect(names.textContent).toBe('Ada');

	server.holdReads = undefined;
	held.resolve();
	await shows(container, '[data-names]', shown);
	await allClear(container);
	expect(history.map((each) => each())).toEqual([
		[false, true, false],
		[false, true, false],
	]);
	expect(reads()).toBe(readsBefore + 1);
}

for (const [mode, mount, readsBefore] of modes) {
	test(`${mode}: a handler that only saves marks the content and its button from the send until the reload settles`, async () => {
		const container = await mounted(await mount());
		await savesAndRefreshes(container, '[data-like]', readsBefore, 'Ada, Grace');
	});

	test(`${mode}: the same through a child that calls the handler it was given`, async () => {
		const container = await mounted(await mount());
		await savesAndRefreshes(container, '[data-child-save]', readsBefore, 'Ada, Linus');
	});

	test(`${mode}: a handler that awaits something else first is marked from its save, not before`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const control = at(container, '[data-check-save]');
		const checked = deferred<void>();
		server.handlerWait = checked.promise;
		control.click();
		await expect.poll(() => server.handlersStarted, poll).toBe(1);
		await nextFrame();
		expect([marked(names), marked(control)]).toEqual([false, false]);
		await savesAndRefreshes(container, '[data-check-save]', readsBefore, 'Ada, Grace', () =>
			checked.resolve(),
		);
	});

	test(`${mode}: a handler that never saves marks nothing`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const control = at(container, '[data-noop]');
		const history = [track(names), track(control)];
		const done = deferred<void>();
		server.handlerWait = done.promise;
		control.click();
		await expect.poll(() => server.handlersStarted, poll).toBe(1);
		await nextFrame();
		done.resolve();
		await nextFrame();
		await nextFrame();
		expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
		expect(history.map((each) => each())).toEqual([[false], [false]]);
		expect(reads()).toBe(readsBefore);
	});

	test(`${mode}: a reload a timer starts marks nothing`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const history = [track(names), track(at(container, '[data-start-poll]'))];
		const tick = deferred<void>();
		const held = deferred<void>();
		server.pollGate = tick.promise;
		at(container, '[data-start-poll]').click();
		await nextFrame();
		server.holdReads = held.promise;
		tick.resolve();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		await nextFrame();
		expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
		server.holdReads = undefined;
		held.resolve();
		await expect.poll(() => text(container, '[data-names]'), poll).toBe('Ada');
		await nextFrame();
		expect(history.map((each) => each())).toEqual([[false], [false]]);
	});

	test(`${mode}: a refused save clears every mark at once and the handler's error reaches @catch`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const control = at(container, '[data-fail]');
		const history = [track(names), track(control)];
		const said = listen();
		const answered = deferred<void>();
		server.nextPost = [{ status: 422, body: 'A name is required', wait: answered.promise }];
		const markedOnSend = sentAndMarked(names, control);
		control.click();
		await markedOnSend();
		answered.resolve();
		await shows(container, '[data-failed]', 'A name is required');
		await allClear(container);
		expect(history.map((each) => each())).toEqual([
			[false, true, false],
			[false, true, false],
		]);
		expect(reads()).toBe(readsBefore);
		expect(text(container, '[data-names]')).toBe('Ada');
		await expect.poll(said, poll).toHaveLength(1);
		expect(['Updated', 'Update failed']).toContain(said()[0]);
	});

	test(`${mode}: a save refused in the same task still reaches @catch with nothing marked`, async () => {
		const container = await mounted(await mount());
		server.nextPost = [{ status: 422, body: 'A name is required', now: true }];
		at(container, '[data-fail]').click();
		await shows(container, '[data-failed]', 'A name is required');
		await allClear(container);
		expect(reads()).toBe(readsBefore);
		expect(text(container, '[data-names]')).toBe('Ada');
	});

	test(`${mode}: a 4xx answer the handler ignores clears the marks and reloads nothing`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const control = at(container, '[data-ignore-status]');
		const said = listen();
		const answered = deferred<void>();
		server.nextPost = [{ status: 409, body: 'Taken', wait: answered.promise }];
		const markedOnSend = sentAndMarked(names, control);
		control.click();
		await markedOnSend();
		answered.resolve();
		await allClear(container);
		expect(container.querySelector('[data-failed]')).toBe(null);
		expect(reads()).toBe(readsBefore);
		expect(text(container, '[data-names]')).toBe('Ada');
		await expect.poll(said, poll).toEqual(['Updated']);
	});

	test(`${mode}: two overlapping saves keep every mark until the one reload after both`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const like = at(container, '[data-like]');
		const child = at(container, '[data-child-save]');
		const history = [track(names), track(like), track(child)];
		const first = deferred<void>();
		const second = deferred<void>();
		const held = deferred<void>();
		server.nextPost = [{ wait: first.promise }, { wait: second.promise }];
		server.holdReads = held.promise;
		like.click();
		child.click();
		await expect.poll(() => server.posts.length, poll).toBe(2);
		await expect.poll(() => [names, like, child].map(marked), poll).toEqual([true, true, true]);
		second.resolve();
		await nextFrame();
		await nextFrame();
		expect([names, like, child].map(marked)).toEqual([true, true, true]);
		expect(reads()).toBe(readsBefore);
		first.resolve();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		expect([names, like, child].map(marked)).toEqual([true, true, true]);
		server.holdReads = undefined;
		held.resolve();
		await shows(container, '[data-names]', 'Ada, Linus, Grace');
		await allClear(container);
		expect(history.map((each) => each())).toEqual([
			[false, true, false],
			[false, true, false],
			[false, true, false],
		]);
		expect(reads()).toBe(readsBefore + 1);
	});

	test(`${mode}: one save says Updating when its marks start and Updated when they clear, once each`, async () => {
		const container = await mounted(await mount());
		const region = () => document.querySelector('[data-markless-announcer]')?.textContent;
		const said = listen();
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		at(container, '[data-like]').click();
		await expect.poll(region, poll).toBe('Updating…');
		answered.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await expect.poll(region, poll).toBe('Updated');
		expect(said()).toEqual(['Updating…', 'Updated']);
	});
}
