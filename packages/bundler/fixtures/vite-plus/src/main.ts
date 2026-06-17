import { render } from 'arcade/runtime/render';
import { loadSymbol, payloadState, payloadView } from './root.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

const status = document.createElement('p');
status.dataset.status = '';
status.textContent = 'ready';

const host = document.createElement('section');
host.dataset.dashboard = '';
host.textContent = 'ready';

await render(
	() => {
		return {
			root: host,
			state: payloadState,
			view: payloadView,
			loadSymbol,
		};
	},
	{
		target: app,
	},
);
app.appendChild(status);
