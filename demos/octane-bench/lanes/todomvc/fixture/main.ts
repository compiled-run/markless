import { render } from '@markless/core';
import { App } from './app.tsrx';

const target = document.querySelector('#app');
if (!target) throw new Error('TodoMVC fixture requires #app');
await render(App, { target });

// Delegated compiled-CSR events are delivered after native propagation ends
// and commits land on a later task than graph.flush(), so the harness waits
// on each interaction's observable DOM effect through this hook.
function settled(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
	return new Promise((resolve, reject) => {
		if (predicate()) {
			resolve();
			return;
		}
		const timer = setTimeout(() => {
			observer.disconnect();
			reject(new Error('TodoMVC commit wait timed out'));
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

declare global {
	interface Window {
		__benchSettled: (predicate: () => boolean, timeoutMs?: number) => Promise<void>;
		__ready: boolean;
	}
}
window.__benchSettled = settled;
window.__ready = true;
