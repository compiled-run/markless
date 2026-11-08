// Starts the figure's compile worker on first use, and compiles one source at a time.
import type { Explored } from './pieces.ts';

let worker: Worker | undefined;
let seq = 0;
const waiting = new Map<number, (result: Explored) => void>();

export function explore(source: string): Promise<Explored> {
	if (!worker) {
		worker = new Worker(new URL('./explore-worker.ts', import.meta.url), { type: 'module' });
		worker.addEventListener('message', (event: MessageEvent<Explored & { id: number }>) => {
			waiting.get(event.data.id)?.(event.data);
			waiting.delete(event.data.id);
		});
	}
	const id = ++seq;
	return new Promise((resolve) => {
		waiting.set(id, resolve);
		worker!.postMessage({ id, source });
	});
}
