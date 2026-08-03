import { render } from '@markless/core';
import App from './App.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for the same-module branch CSR render.');
}

await render(App, { target: app });
