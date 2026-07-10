import { renderToString, type RenderToStringOptions } from '@markless/core';
import App from './root.tsrx';

export { App as default };

export function render(options?: RenderToStringOptions) {
	return renderToString(App, options);
}
