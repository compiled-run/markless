// Compiles every <Code> block of the docs page off the main thread, one compile at a time.
import { createBlockCompiler, type BlockCompiler } from './compile.ts';
import type { WorkerReply, WorkerRequest } from './protocol.ts';
import { loadCodeWasm } from './wasm.ts';
import { workerSourceHost } from './worker-sources.ts';

const scope = self as unknown as {
	postMessage(message: WorkerReply): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
};

// One compiler per block, so each edit rebuilds only what it changed.
const compilers = new Map<string, BlockCompiler>();
// Each block's newest edit, in the order the blocks last sent one.
const waiting = new Map<string, WorkerRequest>();
// Warm-ups, in boot order; they run only when no edit waits.
const warmUps = new Map<string, WorkerRequest>();
let draining = false;

function skip(request: WorkerRequest | undefined): void {
	if (request) scope.postMessage({ id: request.id, outcome: { ok: false, diagnostics: [] } });
}

async function compile({ id, block, files }: WorkerRequest): Promise<void> {
	let compiler = compilers.get(block);
	if (!compiler)
		compilers.set(
			block,
			(compiler = createBlockCompiler(workerSourceHost(block), `code-${block}`)),
		);
	try {
		await loadCodeWasm();
		scope.postMessage({ id, outcome: await compiler.compile(files) });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		scope.postMessage({
			id,
			outcome: { ok: false, diagnostics: [{ file: '', line: 0, column: 0, message }] },
		});
	}
}

function next(): WorkerRequest | undefined {
	const edit = [...waiting.values()].at(-1);
	if (edit) {
		waiting.delete(edit.block);
		return edit;
	}
	const warmUp = warmUps.values().next().value;
	if (warmUp) warmUps.delete(warmUp.block);
	return warmUp;
}

async function drain(): Promise<void> {
	if (draining) return;
	draining = true;
	try {
		for (let request = next(); request; request = next()) await compile(request);
	} finally {
		draining = false;
	}
}

scope.addEventListener('message', (event) => {
	const request = event.data;
	if (request.warmUp) {
		if (waiting.has(request.block)) return skip(request);
		skip(warmUps.get(request.block));
		warmUps.set(request.block, request);
	} else {
		skip(waiting.get(request.block));
		skip(warmUps.get(request.block));
		waiting.delete(request.block);
		warmUps.delete(request.block);
		waiting.set(request.block, request);
	}
	void drain();
});
