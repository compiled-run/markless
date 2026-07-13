import { render } from '@markless/core';
import type { CsrRenderContainer } from '@markless/web';
import { App } from './app.tsrx';

const target = document.querySelector('#app');
if (!target) throw new Error('dbmon fixture requires #app');
let container: CsrRenderContainer | undefined;

async function mount(): Promise<void> {
	if (container) throw new Error('dbmon fixture is already mounted');
	container = await render(App, { target });
}

async function invoke(action: string): Promise<void> {
	if (!container) throw new Error('dbmon fixture is not mounted');
	const button = target.querySelector<HTMLButtonElement>(`#${action}`);
	if (!button) throw new Error(`dbmon action is missing: ${action}`);
	button.click();
	await container.graph.flush();
}

const api = {
	mount,
	invoke,
	async unmount() {
		if (!container) return;
		(container.runtime as { dispose?: () => void }).dispose?.();
		target.replaceChildren();
		container = undefined;
	},
};

declare global {
	interface Window { __dbmonBench: typeof api; __ready: boolean }
}
window.__dbmonBench = api;
window.__ready = true;
