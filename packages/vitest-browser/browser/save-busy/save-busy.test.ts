import { afterEach, beforeEach, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows, text } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { WriterRows } from '../mutations-refresh/writer-row.tsrx';
import { ChainSaves } from './chain-saves.tsrx';
import { end as endWrite } from '../../../web/src/resume-return-reask.ts';
import { Saves } from './saves.tsrx';
import { SearchSaves } from './search-saves.tsrx';
import { SoloSave } from './solo-save.tsrx';

// A save sent from a handler marks what will load again, and the control that sent it, until that reload settles.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());
// The one-frame lag between a round's end and the content clearing shows only on a slow CPU, so the frame tests run throttled.
afterEach(() => commands.throttleCpu(1));

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
const waitFrames = async (count: number) => {
	for (let at = 0; at < count; at++) await nextFrame();
};
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

// The frame in which each element gained and lost aria-busy, counted by requestAnimationFrame.
function frames(
	elements: ReadonlyArray<Element>,
): () => Array<{ readonly on: number[]; readonly off: number[] }> {
	let frame = 0;
	let running = true;
	const tick = () => {
		if (!running) return;
		frame++;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const seen = elements.map(() => ({ on: [] as number[], off: [] as number[] }));
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			const at = seen[elements.indexOf(record.target as Element)]!;
			const now = marked(record.target as Element);
			if (now !== (record.oldValue === 'true')) (now ? at.on : at.off).push(frame);
		}
	});
	for (const element of elements)
		observer.observe(element, {
			attributes: true,
			attributeFilter: ['aria-busy'],
			attributeOldValue: true,
		});
	return () => {
		running = false;
		observer.disconnect();
		return seen;
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

	test(`${mode}: a save sent after an await marks the content from the send and no control, since its sender cannot be named`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const control = at(container, '[data-check-save]');
		const history = [track(names), track(control)];
		const checked = deferred<void>();
		const answered = deferred<void>();
		server.handlerWait = checked.promise;
		server.nextPost = [{ wait: answered.promise }];
		control.click();
		await expect.poll(() => server.handlersStarted, poll).toBe(1);
		await nextFrame();
		expect([marked(names), marked(control)]).toEqual([false, false]);
		checked.resolve();
		await expect.poll(() => server.posts.length, poll).toBe(1);
		await expect.poll(() => marked(names), poll).toBe(true);
		answered.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await allClear(container);
		expect(history.map((each) => each())).toEqual([[false, true, false], [false]]);
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
		await expect.poll(said, poll).toEqual(['Update failed']);
	});

	test(`${mode}: a save refused in the same task still reaches @catch with nothing marked`, async () => {
		const container = await mounted(await mount());
		const said = listen();
		server.nextPost = [{ status: 422, body: 'A name is required', now: true }];
		at(container, '[data-fail]').click();
		await shows(container, '[data-failed]', 'A name is required');
		await allClear(container);
		expect(reads()).toBe(readsBefore);
		expect(text(container, '[data-names]')).toBe('Ada');
		await expect.poll(said, poll).toEqual(['Update failed']);
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
		await expect.poll(said, poll).toEqual(['Update failed']);
		// One failure line, and the failure does not leak into the next save's announcement.
		at(container, '[data-like]').click();
		await shows(container, '[data-names]', 'Ada, Grace');
		await expect.poll(said, poll).toEqual(['Update failed', 'Updated']);
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

	for (const order of ['form first', 'button first'] as const)
		test(`${mode}: a form submit and a button save overlapping (${order} answered) clear every mark in one frame`, async () => {
			const container = await mounted(await mount());
			await commands.throttleCpu(6);
			const names = at(container, '[data-names]');
			const like = at(container, '[data-like]');
			const form = at(container, '[data-form]');
			const history = [track(names), track(like), track(form)];
			const formSave = deferred<void>();
			const likeSave = deferred<void>();
			const held = deferred<void>();
			server.nextPost = [{ wait: likeSave.promise }, { wait: formSave.promise }];
			server.holdReads = held.promise;
			like.click();
			at(container, '[data-form-submit]').click();
			await expect.poll(() => server.posts.length, poll).toBe(2);
			await expect
				.poll(() => [names, like, form].map(marked), poll)
				.toEqual([true, true, true]);
			const seen = frames([names, like, form]);
			const [first, second] =
				order === 'form first' ? [formSave, likeSave] : [likeSave, formSave];
			first.resolve();
			await nextFrame();
			await nextFrame();
			expect([names, like, form].map(marked)).toEqual([true, true, true]);
			second.resolve();
			await expect.poll(reads, poll).toBe(readsBefore + 1);
			expect([names, like, form].map(marked)).toEqual([true, true, true]);
			server.holdReads = undefined;
			held.resolve();
			await allClear(container);
			const cleared = seen().map((each) => each.off);
			expect(cleared[0]).toHaveLength(1);
			expect(cleared).toEqual([cleared[0], cleared[0], cleared[0]]);
			expect(history.map((each) => each())).toEqual([
				[false, true, false],
				[false, true, false],
				[false, true, false],
			]);
			expect(reads()).toBe(readsBefore + 1);
		});

	test(`${mode}: a form inside the @try whose content reloads is marked with it and cleared in the same frame`, async () => {
		const container = await mounted(await mount());
		await commands.throttleCpu(6);
		const names = at(container, '[data-names]');
		const form = at(container, '[data-form]');
		const seen = frames([names, form]);
		const answered = deferred<void>();
		const held = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		at(container, '[data-form-submit]').click();
		await expect.poll(() => [names, form].map(marked), poll).toEqual([true, true]);
		server.holdReads = held.promise;
		answered.resolve();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		expect([names, form].map(marked)).toEqual([true, true]);
		server.holdReads = undefined;
		held.resolve();
		await shows(container, '[data-names]', 'Ada, Form');
		await allClear(container);
		const [content, own] = seen();
		expect(content!.on).toHaveLength(1);
		expect(own!.on).toEqual(content!.on);
		expect(content!.off).toHaveLength(1);
		expect(own!.off).toEqual(content!.off);
	});

	test(`${mode}: a save that fails while another save's reload loads keeps that save's control marked`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const like = at(container, '[data-like]');
		const other = at(container, '[data-ignore-status]');
		const history = [track(names), track(like), track(other)];
		const held = deferred<void>();
		server.holdReads = held.promise;
		server.nextPost = [{}, { status: 409, body: 'Taken' }];
		like.click();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		other.click();
		await expect.poll(() => server.posts.length, poll).toBe(2);
		await expect.poll(() => marked(other), poll).toBe(false);
		await nextFrame();
		expect([names, like].map(marked)).toEqual([true, true]);
		server.holdReads = undefined;
		held.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await allClear(container);
		expect(history.map((each) => each())).toEqual([
			[false, true, false],
			[false, true, false],
			[false, true, false],
		]);
	});

	test(`${mode}: a handler that writes a key input to the value it has, then saves, stays marked with no gap`, async () => {
		const container = await mounted(await mount());
		await savesAndRefreshes(container, '[data-same-key-save]', readsBefore, 'Ada, Grace');
	});

	test(`${mode}: a handler that never finishes holds the marks, and the reload, until it does`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const control = at(container, '[data-save-then-wait]');
		const history = [track(names), track(control)];
		const waiting = deferred<void>();
		server.handlerWait = waiting.promise;
		control.click();
		await expect.poll(() => server.handlersStarted, poll).toBe(1);
		await nextFrame();
		await nextFrame();
		expect([marked(names), marked(control)]).toEqual([true, true]);
		expect(reads()).toBe(readsBefore);
		waiting.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await allClear(container);
		expect(history.map((each) => each())).toEqual([
			[false, true, false],
			[false, true, false],
		]);
	});

	test(`${mode}: a poll that lands while a save is out keeps the mark and adds no announcement`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const like = at(container, '[data-like]');
		const history = [track(names), track(like)];
		const said = listen();
		const tick = deferred<void>();
		server.pollGate = tick.promise;
		at(container, '[data-start-poll]').click();
		await nextFrame();
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		like.click();
		await expect.poll(() => [names, like].map(marked), poll).toEqual([true, true]);
		await expect.poll(said, poll).toEqual(['Updating…']);
		tick.resolve();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		await waitFrames(4);
		expect([names, like].map(marked)).toEqual([true, true]);
		answered.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await allClear(container);
		await expect.poll(said, poll).toEqual(['Updating…', 'Updated']);
		expect(history.map((each) => each())).toEqual([
			[false, true, false],
			[false, true, false],
		]);
	});

	test(`${mode}: a poll alone marks nothing and says nothing before the next save's pair`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const history = track(names);
		const said = listen();
		const tick = deferred<void>();
		server.pollGate = tick.promise;
		at(container, '[data-start-poll]').click();
		tick.resolve();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		await waitFrames(4);
		expect(history()).toEqual([false]);
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		at(container, '[data-like]').click();
		await expect.poll(said, poll).toEqual(['Updating…']);
		answered.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await expect.poll(said, poll).toEqual(['Updating…', 'Updated']);
	});

	test(`${mode}: a second save sent during the first save's reload keeps one mark and one announcement pair`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const history = track(names);
		const said = listen();
		const held = deferred<void>();
		const second = deferred<void>();
		server.holdReads = held.promise;
		server.nextPost = [{}, { wait: second.promise }];
		at(container, '[data-like]').click();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		at(container, '[data-child-save]').click();
		await expect.poll(() => server.posts.length, poll).toBe(2);
		await expect.poll(said, poll).toEqual(['Updating…']);
		server.holdReads = undefined;
		held.resolve();
		await waitFrames(4);
		expect(marked(names)).toBe(true);
		expect(names.textContent).toBe('Ada');
		second.resolve();
		await shows(container, '[data-names]', 'Ada, Grace, Linus');
		await allClear(container);
		await expect.poll(said, poll).toEqual(['Updating…', 'Updated']);
		expect(history()).toEqual([false, true, false]);
	});

	test(`${mode}: a handler that changes a key input, then saves, stays marked when the changed value lands first`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const control = at(container, '[data-key-change-save]');
		const history = [track(names), track(control)];
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		control.click();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		await waitFrames(4);
		expect([names, control].map(marked)).toEqual([true, true]);
		answered.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await allClear(container);
		expect(history.map((each) => each())).toEqual([
			[false, true, false],
			[false, true, false],
		]);
	});

	test(`${mode}: only the control whose handler sent the save is marked, and the reload does not wait for a handler still awaiting something else`, async () => {
		const container = await mounted(await mount());
		const waiting = at(container, '[data-noop]');
		const like = at(container, '[data-like]');
		const history = [track(waiting), track(like)];
		const done = deferred<void>();
		server.handlerWait = done.promise;
		waiting.click();
		await expect.poll(() => server.handlersStarted, poll).toBe(1);
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		like.click();
		await expect.poll(() => marked(like), poll).toBe(true);
		expect(marked(waiting)).toBe(false);
		answered.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await allClear(container);
		expect(history.map((each) => each())).toEqual([[false], [false, true, false]]);
		done.resolve();
	});

	test(`${mode}: a retry sent after the failed save's await is a second round: the content is marked again, the control only for the first`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const control = at(container, '[data-retry]');
		const history = track(control);
		const retried = deferred<void>();
		server.nextPost = [{ status: 422, body: 'No', now: true }, { wait: retried.promise }];
		control.click();
		await expect.poll(() => server.posts.length, poll).toBe(2);
		await expect.poll(() => marked(names), poll).toBe(true);
		expect(marked(control)).toBe(false);
		retried.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await allClear(container);
		expect(history()).toEqual([false, true, false]);
	});

	test(`${mode}: a save that fails during another save's reload announces its failure once, and the next save says Updated`, async () => {
		const container = await mounted(await mount());
		const said = listen();
		const held = deferred<void>();
		server.holdReads = held.promise;
		server.nextPost = [{}, { status: 409, body: 'Taken' }];
		at(container, '[data-like]').click();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		at(container, '[data-ignore-status]').click();
		await expect.poll(() => server.posts.length, poll).toBe(2);
		await expect.poll(said, poll).toEqual(['Updating…']);
		server.holdReads = undefined;
		held.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await allClear(container);
		await expect.poll(said, poll).toEqual(['Updating…', 'Update failed']);
		at(container, '[data-like]').click();
		await shows(container, '[data-names]', 'Ada, Grace, Grace');
		await allClear(container);
		await expect.poll(said, poll).toEqual(['Updating…', 'Update failed', 'Updated']);
	});

	test(`${mode}: a reload that fails after a good save keeps the content, opens @catch after it, and says Update failed`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const said = listen();
		server.failReads = 1;
		at(container, '[data-like]').click();
		await shows(container, '[data-failed]', 'Loading failed');
		expect(names.isConnected).toBe(true);
		expect(names.textContent).toBe('Ada');
		await allClear(container);
		await expect.poll(said, poll).toEqual(['Update failed']);
	});

	test(`${mode}: a chain of async values held by a save stays marked through the input's reload and clears once`, async () => {
		const container = (await (mode === 'CSR' ? render(ChainSaves) : renderSSR(ChainSaves)))
			.container as HTMLElement;
		await shows(container, '[data-people]', 'Ada');
		await shows(container, '[data-count]', '1');
		const count = at(container, '[data-count]');
		const people = at(container, '[data-people]');
		const history = [track(count), track(people)];
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		at(container, '[data-chain-save]').click();
		await expect.poll(() => [count, people].map(marked), poll).toEqual([true, true]);
		answered.resolve();
		await shows(container, '[data-people]', 'Ada, Grace');
		await shows(container, '[data-count]', '2');
		await allClear(container);
		expect(history.map((each) => each())).toEqual([
			[false, true, false],
			[false, true, false],
		]);
		expect(server.gets.filter((get) => get.startsWith('/mut/items?count='))).toEqual(
			mode === 'CSR' ? ['/mut/items?count=1', '/mut/items?count=2'] : ['/mut/items?count=2'],
		);
	});

	test(`${mode}: a chain held by a save that fails gives every mark back at once and loads nothing`, async () => {
		const container = (await (mode === 'CSR' ? render(ChainSaves) : renderSSR(ChainSaves)))
			.container as HTMLElement;
		await shows(container, '[data-count]', '1');
		const before = server.gets.length;
		const said = listen();
		const answered = deferred<void>();
		server.nextPost = [{ status: 409, body: 'Taken', wait: answered.promise }];
		at(container, '[data-chain-ignore]').click();
		await expect.poll(() => marked(at(container, '[data-count]')), poll).toBe(true);
		answered.resolve();
		await allClear(container);
		await expect.poll(said, poll).toEqual(['Update failed']);
		// The input is not asked again. A served reader blocked behind the marked input asks its unchanged key once (known gap).
		expect(server.gets.slice(before).filter((get) => get.includes('v=people'))).toEqual([]);
		expect(server.gets.slice(before).filter((get) => get.includes('count='))).toEqual(
			mode === 'CSR' ? [] : ['/mut/items?count=1'],
		);
		expect(text(container, '[data-count]')).toBe('1');
	});

	test(`${mode}: a draft row that saves from its recipe after its dispatch ended marks nothing and reloads nothing`, async () => {
		const container = (await (mode === 'CSR' ? render(WriterRows) : renderSSR(WriterRows)))
			.container as HTMLElement;
		await shows(container, '[data-names]', 'Ada');
		const names = at(container, '[data-names]');
		const history = track(names);
		const before = reads();
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		at(container, '[data-draft-add]').click();
		await expect
			.poll(() => container.querySelector('[data-draft]')?.textContent, poll)
			.toBe('Draft');
		await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items Draft']);
		await waitFrames(2);
		expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
		answered.resolve();
		await shows(container, '[data-saved]', 'Draft');
		await waitFrames(2);
		expect(history()).toEqual([false]);
		expect(reads()).toBe(before);
		expect(text(container, '[data-names]')).toBe('Ada');
	});

	if (mode === 'CSR')
		test(`${mode}: a container removed while its reload runs releases the control that saved, in another container`, async () => {
			const solo = (await render(SoloSave)).container as HTMLElement;
			await shows(solo, '[data-ready]', 'ready');
			const screen = await mount();
			await mounted(screen);
			const control = at(solo, '[data-solo]');
			server.holdReads = new Promise(() => {});
			control.click();
			await expect.poll(reads, poll).toBe(readsBefore + 1);
			expect(marked(control)).toBe(true);
			(screen as unknown as { unmount: () => void }).unmount();
			await expect.poll(() => marked(control), poll).toBe(false);
			expect(document.querySelectorAll('[aria-busy]').length).toBe(0);
		});

	test(`${mode}: a quiet poll already loading when the save is sent is marked from the send`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const history = track(names);
		const tick = deferred<void>();
		server.pollGate = tick.promise;
		at(container, '[data-start-poll]').click();
		await nextFrame();
		const pollAnswer = deferred<void>();
		server.holdReads = pollAnswer.promise;
		tick.resolve();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		await waitFrames(2);
		expect(marked(names)).toBe(false);
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		const like = at(container, '[data-like]');
		const markedOnSend = sentAndMarked(names, like);
		like.click();
		await markedOnSend();
		server.holdReads = undefined;
		pollAnswer.resolve();
		await waitFrames(4);
		expect(marked(names)).toBe(true);
		answered.resolve();
		await shows(container, '[data-names]', 'Ada, Grace');
		await allClear(container);
		expect(history()).toEqual([false, true, false]);
	});

	test(`${mode}: a search key typed while a save is out shows the newest answer when the save's reload lands`, async () => {
		const container = (await (mode === 'CSR' ? render(SearchSaves) : renderSSR(SearchSaves))).container as HTMLElement;
		await shows(container, '[data-found]', '?q=a');
		const found = at(container, '[data-found]');
		const history = track(found);
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		at(container, '[data-search-save]').click();
		await expect.poll(() => marked(found), poll).toBe(true);
		const input = at(container, '[data-query]') as HTMLInputElement;
		input.value = 'ab';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await expect.poll(() => server.gets.includes('/mut/items?q=ab'), poll).toBe(true);
		await waitFrames(4);
		expect([found.textContent, marked(found)]).toEqual(['?q=a', true]);
		answered.resolve();
		await shows(container, '[data-found]', '?q=ab');
		await allClear(container);
		expect(history()).toEqual([false, true, false]);
		expect(server.gets.at(-1)).toBe('/mut/items?q=ab');
	});

	test(`${mode}: a save that sends the page elsewhere ends its round at once and says nothing`, async () => {
		const container = await mounted(await mount());
		const names = at(container, '[data-names]');
		const like = at(container, '[data-like]');
		const said = listen();
		const answered = deferred<void>();
		server.nextPost = [{ wait: answered.promise }];
		like.click();
		await expect.poll(() => [names, like].map(marked), poll).toEqual([true, true]);
		endWrite('left');
		await allClear(container);
		answered.resolve();
		await waitFrames(4);
		expect(reads()).toBe(readsBefore);
		at(container, '[data-like]').click();
		await shows(container, '[data-names]', 'Ada, Grace, Grace');
		await allClear(container);
		await expect.poll(said, poll).toEqual(['Updated']);
	});

	test(`${mode}: a save sent after an await while another save's reload loads still reloads with its data`, async () => {
		const container = await mounted(await mount());
		const held = deferred<void>();
		const checked = deferred<void>();
		server.holdReads = held.promise;
		server.handlerWait = checked.promise;
		at(container, '[data-like]').click();
		await expect.poll(reads, poll).toBe(readsBefore + 1);
		at(container, '[data-check-save]').click();
		await expect.poll(() => server.handlersStarted, poll).toBe(1);
		checked.resolve();
		await expect.poll(() => server.posts.length, poll).toBe(2);
		server.holdReads = undefined;
		held.resolve();
		await shows(container, '[data-names]', 'Ada, Grace, Grace');
		await allClear(container);
		expect(reads()).toBe(readsBefore + 2);
	});
}
