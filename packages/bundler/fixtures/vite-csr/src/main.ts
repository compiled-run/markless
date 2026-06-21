import { render } from '@arcade/runtime/render';
import { preloadLazySymbolModules } from '../../../src/build/module-preload-dom.ts';
import { App, payloadView } from './root.tsrx';
import type { ArcadeBundleGraph } from '../../../src/types.ts';

const csrPreloadsReady = preloadCsrLazySymbols();

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

const status = document.createElement('p');
status.id = 'hmr-status';
status.textContent = 'ready';

document.body.dataset.csrLazyModule = 'cold';
document.addEventListener('arcade:csr-lazy-module-evaluated', () => {
	document.body.dataset.csrLazyModule = 'evaluated';
});

await render(App, { target: app });
app.appendChild(status);
await csrPreloadsReady;

if (import.meta.hot) {
	document.addEventListener('arcade:update', (event) => {
		event.preventDefault();
		status.textContent = event.type;
	});
}

async function preloadCsrLazySymbols(): Promise<void> {
	const response = await fetch('/build/bundle-graph.json');
	if (!response.ok) return;
	preloadLazySymbolModules({
		base: '/build/',
		bundleGraph: (await response.json()) as ArcadeBundleGraph,
		view: payloadView,
	});
}
