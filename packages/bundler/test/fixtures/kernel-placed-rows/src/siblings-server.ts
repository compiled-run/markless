import { renderToStream } from '../../../../../web/src/render-to-stream.ts';
import Page from './siblings-page.tsrx';

export { Page as default };

// Streamed as a host would: the shell, then the arms the server settles.
export async function render() {
	const stream = await renderToStream(Page);
	let html = stream.shell;
	for await (const chunk of stream.appends()) html += chunk;
	return html;
}
