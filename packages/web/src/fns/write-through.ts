type GraphOperation = { readonly graphNodeId: string; readonly path?: ReadonlyArray<string> };

type WriteThroughContext = {
	readonly graph: {
		read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
		write(write: GraphOperation & { readonly value: unknown }): void;
		update(
			update: GraphOperation & {
				readonly returnValue?: string;
				update(value: unknown): unknown;
			},
		): unknown;
		call(
			call: GraphOperation & {
				readonly method: string;
				readonly args?: ReadonlyArray<unknown>;
			},
		): unknown;
		delete(deletion: GraphOperation & { readonly path: ReadonlyArray<string> }): boolean;
		touch?(touch: GraphOperation): void;
	};
};

type WriteThroughGraph = Pick<
	WriteThroughContext['graph'],
	'write' | 'update' | 'call' | 'delete'
> & {
	touch(touch: GraphOperation): void;
};

// A value no longer where the local found it is a plain object: the write changes only it, as JavaScript would.
export function marklessWriteThrough(
	context: WriteThroughContext,
	graphNodeId: string,
	basePath: ReadonlyArray<string>,
	local: unknown,
	element: boolean,
): WriteThroughGraph {
	const at = locate(context, graphNodeId, basePath, local, element);
	if (!at) return plainTarget(local);
	const graph = context.graph;
	const full = (path: ReadonlyArray<string> | undefined) => [...at, ...(path ?? [])];
	return {
		write: (write) => graph.write({ ...write, path: full(write.path) }),
		update: (update) => graph.update({ ...update, path: full(update.path) }),
		call: (call) => graph.call({ ...call, path: full(call.path) }),
		delete: (deletion) => graph.delete({ ...deletion, path: full(deletion.path) }),
		touch: (touch) => touchGraph(graph, { ...touch, path: full(touch.path) }),
	};
}

function touchGraph(graph: WriteThroughContext['graph'], touch: GraphOperation): void {
	if (!graph.touch) {
		throw Object.assign(new Error('This graph cannot be told a value changed in place.'), {
			code: 'MARKLESS_GRAPH_TOUCH_UNSUPPORTED',
			graphNodeId: touch.graphNodeId,
		});
	}
	graph.touch(touch);
}

/**
 * The value a call returned, once the path a function the compiler saw it
 * change in place (`rename(user, 'Cy')`) has been invalidated.
 */
export function marklessAfterCall<T>(
	result: T,
	graph: WriteThroughContext['graph'] | Pick<WriteThroughGraph, 'touch'>,
	touch: GraphOperation,
): T {
	touchGraph(graph as WriteThroughContext['graph'], touch);
	return result;
}

function locate(
	context: WriteThroughContext,
	graphNodeId: string,
	basePath: ReadonlyArray<string>,
	local: unknown,
	element: boolean,
): string[] | null {
	if (local === null || typeof local !== 'object') return null;
	const base = context.graph.read(graphNodeId, basePath);
	if (!element) return base === local ? [...basePath] : null;
	if (!Array.isArray(base)) return null;
	const index = base.indexOf(local);
	return index < 0 ? null : [...basePath, String(index)];
}

function plainTarget(local: unknown): WriteThroughGraph {
	const parentOf = (path: ReadonlyArray<string>) => {
		let cursor = local as Record<string, unknown>;
		for (const segment of path.slice(0, -1))
			cursor = cursor[segment] as Record<string, unknown>;
		return cursor;
	};
	const last = (path: ReadonlyArray<string>) => path[path.length - 1]!;
	return {
		write: (write) => {
			parentOf(write.path ?? [])[last(write.path ?? [])] = write.value;
		},
		update: (update) => {
			const parent = parentOf(update.path ?? []);
			const key = last(update.path ?? []);
			const previous = parent[key];
			const next = update.update(previous);
			parent[key] = next;
			return update.returnValue === 'previous' ? previous : next;
		},
		call: (call) => {
			const path = call.path ?? [];
			const target = path.length === 0 ? local : parentOf(path)[last(path)];
			const method = (target as Record<string, unknown>)[call.method] as (
				...args: unknown[]
			) => unknown;
			return Reflect.apply(method, target, [...(call.args ?? [])]);
		},
		delete: (deletion) => delete parentOf(deletion.path)[last(deletion.path)],
		touch: () => {},
	};
}

/** `Object.assign(target, ...sources)` onto state: each own member a source carries is one graph write. */
export function marklessObjectAssign(
	graph: Pick<WriteThroughGraph, 'write'>,
	graphNodeId: string,
	path: ReadonlyArray<string>,
	target: unknown,
	sources: ReadonlyArray<unknown>,
): unknown {
	for (const source of sources) {
		if (source == null) continue;
		const members = Object(source) as Record<string, unknown>;
		for (const key of Object.keys(members)) {
			graph.write({ graphNodeId, path: [...path, key], value: members[key] });
		}
	}
	return target;
}
