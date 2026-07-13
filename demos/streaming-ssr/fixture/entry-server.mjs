import { renderToStream } from '@markless/web/render-to-stream';
import StreamingPage from './app.tsrx';

export async function renderStream(scenario, onChunk) {
	const stream = await renderToStream(StreamingPage, {
		props: { scenario },
		executionLog: 'never',
	});
	onChunk(stream.shell);
	for await (const chunk of stream.appends()) onChunk(chunk);
}
