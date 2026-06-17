import { render } from 'arcade/runtime/render';
import { loadSymbol, payloadState, payloadView } from './root.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

const status = document.createElement('p');
status.id = 'hmr-status';
status.textContent = 'ready';

const counter = document.createElement('button');

counter.type = 'button';
counter.dataset.counter = '';
counter.textContent = '0';

await render(
	() => {
		return {
			root: counter,
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

if (import.meta.hot) {
	document.addEventListener('arcade:update', (event) => {
		event.preventDefault();
		status.textContent = event.type;
	});
}
