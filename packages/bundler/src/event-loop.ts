// A whole-module compile finishes on microtasks alone, so a graph of them holds
// the dev server's thread for as long as the graph takes: node never reads the
// requests already queued on its sockets, and when it finally does, their
// overdue keep-alive timers fire and destroy the connections. One macrotask
// between per-module compiles is what gives the poll phase its turn.
export function yieldToEventLoop(): Promise<void> {
	return new Promise<void>((resolve) => {
		setImmediate(resolve);
	});
}
