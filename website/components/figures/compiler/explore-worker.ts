// Compiles the figure's source in the browser, off the main thread, and answers with its pieces.
import { compileTsrxModule } from '../../../../packages/compiler/src/index.ts';
import { piecesOf } from './pieces.ts';

const scope = self as unknown as {
	postMessage(message: unknown): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<{ id: number; source: string }>) => void): void;
};

scope.addEventListener('message', async ({ data }) => {
	try {
		const result = await compileTsrxModule({ filename: '/chat.tsrx', source: data.source, symbols: [] });
		scope.postMessage({ id: data.id, ...piecesOf(result, data.source) });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		scope.postMessage({ id: data.id, pieces: [], errors: [message.split(':')[0] ?? 'compile failed'] });
	}
});
