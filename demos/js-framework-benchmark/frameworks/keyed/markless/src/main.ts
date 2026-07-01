import { render } from '@markless/web/render';
import { App } from './root.tsrx';

const target = document.querySelector('#main');
if (!target) {
	throw new Error('Expected #main target for Markless benchmark.');
}

await render(App, { target });
