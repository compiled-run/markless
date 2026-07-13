import { render } from '@markless/core';
import { App } from './app.tsrx';

const target = document.querySelector('#app');
if (!target) throw new Error('chat-stream fixture requires #app');
await render(App, { target });

// Delegated compiled-CSR events are delivered after native propagation ends
// and commits land on a later task than graph.flush(), so every hook waits on
// the observable DOM effect of its dispatch instead of trusting the flush.
function settled(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
	return new Promise((resolve, reject) => {
		if (predicate()) {
			resolve();
			return;
		}
		const timer = setTimeout(() => {
			observer.disconnect();
			reject(new Error('chat-stream commit wait timed out'));
		}, timeoutMs);
		const observer = new MutationObserver(() => {
			if (!predicate()) return;
			clearTimeout(timer);
			observer.disconnect();
			resolve();
		});
		observer.observe(target, {
			childList: true,
			characterData: true,
			attributes: true,
			subtree: true,
		});
	});
}

function messageCount(): number {
	return target.querySelectorAll('.messages .message').length;
}

function streamingCount(): number {
	return [...target.querySelectorAll('.message-state')].filter((node) =>
		node.textContent?.includes('streaming'),
	).length;
}

async function reset(): Promise<void> {
	const button = target.querySelector<HTMLButtonElement>('#bench-reset');
	if (!button) throw new Error('chat-stream reset control is missing');
	button.click();
	await settled(() => messageCount() === 10 && streamingCount() === 0);
}

async function pump(batch: number): Promise<number> {
	const input = target.querySelector<HTMLInputElement>('#bench-pump-size');
	const button = target.querySelector<HTMLButtonElement>('#bench-pump');
	if (!input || !button) throw new Error('chat-stream pump controls are missing');
	// The pump handler reads the uncontrolled input directly, so the value is
	// visible to it without waiting on a state commit.
	input.value = String(batch);
	const before = button.dataset.remaining;
	button.click();
	await settled(() => button.dataset.remaining !== before);
	return Number(button.dataset.remaining ?? '0');
}

declare global {
	interface Window {
		__benchSettled: (predicate: () => boolean, timeoutMs?: number) => Promise<void>;
		__pump: (batch: number) => Promise<number>;
		__reset: () => Promise<void>;
		__ready: boolean;
	}
}
window.__benchSettled = settled;
window.__pump = pump;
window.__reset = reset;
window.__ready = true;
