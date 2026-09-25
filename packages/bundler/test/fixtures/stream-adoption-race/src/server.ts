import { renderToStream } from '../../../../../web/src/render-to-stream.ts';
import App from './root.tsrx';

export { App as default };

export function stream() {
	return renderToStream(App as never, {});
}
