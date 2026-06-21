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
	if (!response.ok || !isJsonResponse(response)) return;

	let bundleGraph: ArcadeBundleGraph;
	try {
		bundleGraph = (await response.json()) as ArcadeBundleGraph;
	} catch {
		return;
	}

	preloadLazySymbolModules({
		base: '/build/',
		bundleGraph,
		view: payloadView,
	});
}

function isJsonResponse(response: Response): boolean {
	return (response.headers.get('content-type') ?? '').includes('application/json');
}
