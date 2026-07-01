import { render } from '@markless/core';
import App from './root.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

const status = document.createElement('p');
status.id = 'hmr-status';
status.textContent = 'ready';

await render(App, { target: app });
app.appendChild(status);
