// Compiles a <Code> block off the main thread, so the docs page never waits on the compiler.
import { compileFiles } from './compile.ts';
import type { WorkerReply, WorkerRequest } from './protocol.ts';
import { loadCodeWasm } from './wasm.ts';
import { workerSourceHost } from './worker-sources.ts';

const scope = self as unknown as {
	postMessage(message: WorkerReply): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
};

let queue: Promise<unknown> = Promise.resolve();
let newest = -1;

scope.addEventListener('message', (event) => {
	const { id, files } = event.data;
	newest = id;
	queue = queue.then(async () => {
		// The frame drops every reply but the newest, so an edit typed over is not compiled.
		if (id !== newest)
			return scope.postMessage({ id, outcome: { ok: false, diagnostics: [] } });
		try {
			await loadCodeWasm();
			scope.postMessage({
				id,
				outcome: await compileFiles(files, `code-${id}`, workerSourceHost),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			scope.postMessage({
				id,
				outcome: { ok: false, diagnostics: [{ file: '', line: 0, column: 0, message }] },
			});
		}
	});
});
