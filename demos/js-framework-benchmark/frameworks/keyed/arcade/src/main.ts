import { render } from '@arcade/runtime/render';
import { App } from './root.tsrx';

const target = document.querySelector('#main');
if (!target) {
	throw new Error('Expected #main target for Arcade benchmark.');
}

await render(App, { target });
