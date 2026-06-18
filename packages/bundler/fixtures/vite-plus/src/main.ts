import { render } from 'arcade/runtime/render';
import { createRoot, loadSymbol, payloadState, payloadView } from './root.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

await render(
	() => {
		return {
			root: createRoot(),
			state: payloadState,
			view: payloadView,
			loadSymbol,
		};
	},
	{
		target: app,
	},
);
