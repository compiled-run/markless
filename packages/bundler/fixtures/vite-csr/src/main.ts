import { render } from '@arcade/runtime/render';
import { App } from './root.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

const status = document.createElement('p');
status.id = 'hmr-status';
status.textContent = 'ready';

await render(App, { target: app });
app.appendChild(status);

if (import.meta.hot) {
	document.addEventListener('arcade:update', (event) => {
		event.preventDefault();
		status.textContent = event.type;
	});
}
