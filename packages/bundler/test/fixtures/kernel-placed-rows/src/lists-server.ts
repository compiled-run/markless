import { renderToStream } from '../../../../../web/src/render-to-stream.ts';
import Page from './lists-page.tsrx';

export { Page as default };

// Streamed as a host would: the shell, then whatever arms the server settles; lists in component rows stay to the browser.
export async function render() {
	const stream = await renderToStream(Page);
	let html = stream.shell;
	for await (const chunk of stream.appends()) html += chunk;
	return html;
}
