import { render } from '@markless/core';
import Dashboard from './root.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

const status = document.createElement('p');
status.dataset.status = '';
status.textContent = 'ready';

await render(Dashboard, { target: app });
app.appendChild(status);
