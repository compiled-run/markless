import { render } from '@markless/core';
import { App } from './root.tsrx';

await render(App, { target: document.querySelector('#app')! });
