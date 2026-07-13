import { render } from '@markless/web/render';
import { App } from './app.tsrx';

const target = document.querySelector('#app');
if (!target) throw new Error('TodoMVC size fixture requires #app');
await render(App, { target });
