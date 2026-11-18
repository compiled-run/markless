import type { Plugin } from 'rolldown';
import { renderedChunkCount } from './chunk-ast.ts';

// Past about 30 chunks Rolldown 1.2 reports a failed renderChunk only after every other chunk's has settled, so a hook
// waiting for every chunk would wait forever; failures are counted here, per render, from every plugin's hook.
type Render = { failed: number; readonly waiters: Map<object, () => boolean> };

const renders = new WeakMap<object, Render>();
const watched = new WeakSet<object>();

function renderOf(chunks: object): Render {
	let render = renders.get(chunks);
	if (!render) renders.set(chunks, (render = { failed: 0, waiters: new Map() }));
	return render;
}

function chunkFailed(chunks: unknown): void {
	if (!chunks || typeof chunks !== 'object') return;
	const render = renderOf(chunks);
	render.failed++;
	for (const check of render.waiters.values()) check();
}

/** Counts each chunk any plugin's renderChunk fails, so `everyChunkArrived` stops waiting for it. */
export function watchRenderChunkFailures(plugins: unknown): void {
	if (Array.isArray(plugins)) {
		for (const plugin of plugins) watchRenderChunkFailures(plugin);
		return;
	}
	if (!plugins || typeof plugins !== 'object' || watched.has(plugins)) return;
	const plugin = plugins as Plugin;
	const hook = plugin.renderChunk;
	if (!hook) return;
	watched.add(plugin);
	const handler = typeof hook === 'function' ? hook : hook.handler;
	const watchedHandler: typeof handler = function (this, code, chunk, options, meta) {
		let result: ReturnType<typeof handler>;
		try {
			result = handler.call(this, code, chunk, options, meta);
		} catch (error) {
			chunkFailed(meta?.chunks);
			throw error;
		}
		if (!result || typeof (result as PromiseLike<unknown>).then !== 'function') return result;
		return Promise.resolve(result).catch((error: unknown) => {
			chunkFailed(meta?.chunks);
			throw error;
		});
	};
	plugin.renderChunk =
		typeof hook === 'function' ? watchedHandler : { ...hook, handler: watchedHandler };
}

/**
 * Whether every chunk of this render has reached the caller. When a chunk fails in any plugin instead, `abandon` runs
 * once the rest have arrived: the build is failing, and Rolldown reports that chunk's error once nothing waits.
 */
export function everyChunkArrived(
	chunks: Readonly<Record<string, unknown>>,
	owner: object,
	arrived: () => number,
	abandon: () => void,
): boolean {
	const render = renderOf(chunks);
	const total = renderedChunkCount(chunks);
	const check = () => {
		if (arrived() + render.failed < total) return false;
		render.waiters.delete(owner);
		if (!render.failed) return true;
		abandon();
		return false;
	};
	render.waiters.set(owner, check);
	return check();
}
