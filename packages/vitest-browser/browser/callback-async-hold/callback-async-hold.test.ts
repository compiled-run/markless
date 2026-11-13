import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answerSave, saveIsPending } from './api.ts';
import SaverPage from './saver-page.tsrx';

// A callback a handler calls holds the handler's writes only through its own synchronous run, not until its promise settles.
afterEach(() => {
	answerSave();
	cleanup();
});

const text = (selector: string) => document.querySelector(selector)?.textContent;
const poll = { timeout: 2_000, interval: 5 };

// Read once each task's microtasks have drained, which is what a frame can paint.
function watchTaskEnds() {
	const torn: string[] = [];
	const channel = new MessageChannel();
	channel.port1.onmessage = () => {
		if ((text('[data-note]') === 'clicked') !== (text('[data-saving]') === 'Ada'))
			torn.push(`note=${text('[data-note]')} saving=${text('[data-saving]')}`);
	};
	const observer = new MutationObserver(() => channel.port2.postMessage(null));
	observer.observe(document.body, { subtree: true, childList: true, characterData: true });
	return {
		torn,
		stop() {
			observer.disconnect();
			channel.port1.close();
		},
	};
}

async function handlerWriteDoesNotWaitForTheCallback() {
	const watch = watchTaskEnds();
	document.querySelector<HTMLButtonElement>('[data-go]')!.click();
	await expect.poll(() => text('[data-note]'), poll).toBe('clicked');
	expect(saveIsPending()).toBe(true);
	expect(text('[data-saving]')).toBe('Ada');
	expect(text('[data-saved]')).toBe('');
	answerSave();
	await expect.poll(() => text('[data-saved]'), poll).toBe('Ada');
	watch.stop();
	expect(watch.torn).toEqual([]);
}

test('client-rendered: the handler and the callback before its await paint while the callback is pending', async () => {
	await render(SaverPage);
	await handlerWriteDoesNotWaitForTheCallback();
});

test('server-rendered: the handler and the callback before its await paint while the callback is pending', async () => {
	await renderSSR(SaverPage);
	await handlerWriteDoesNotWaitForTheCallback();
});
