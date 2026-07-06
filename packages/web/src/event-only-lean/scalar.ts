import type { SerializedSlot } from '../../../serializer/src/value-decode-client.ts';
import type { EventOnlyResumeDomElement } from './types.ts';

export type EventOnlyGraphCells = Map<string, unknown>;

export function eventOnlyGraphCells(root: EventOnlyResumeDomElement): EventOnlyGraphCells {
	const existing = root.__marklessEventOnlyGraph;
	if (existing) return existing;
	const cells = new Map<string, unknown>();
	root.__marklessEventOnlyGraph = cells;
	return cells;
}

export function decodeScalarSlot(slot: SerializedSlot): unknown {
	if (
		slot === null ||
		typeof slot === 'string' ||
		typeof slot === 'number' ||
		typeof slot === 'boolean'
	) return slot;
	if (slot.$type === 'undefined') return undefined;
	if (slot.$type === 'bigint') return BigInt(slot.value);
	if (slot.$type === 'date') return new Date(slot.value);
}

export function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let cursor = value as Record<string, unknown> | null | undefined;
	for (const key of path) {
		if (cursor == null) return undefined;
		cursor = cursor[key] as Record<string, unknown> | null | undefined;
	}
	return cursor;
}

export function writePath(
	value: unknown,
	path: ReadonlyArray<string>,
	nextValue: unknown,
): unknown {
	if (path.length === 0) return nextValue;
	const root = isRecord(value) ? value : {};
	let cursor = root;
	for (const key of path.slice(0, -1)) {
		const child = cursor[key];
		if (!isRecord(child)) cursor[key] = {};
		cursor = cursor[key] as Record<string, unknown>;
	}
	cursor[path[path.length - 1]!] = nextValue;
	return root;
}

export function pathsIntersect(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
	return startsWithPath(a, b) || startsWithPath(b, a);
}

function startsWithPath(path: ReadonlyArray<string>, prefix: ReadonlyArray<string>): boolean {
	return path.length >= prefix.length && prefix.every((part, index) => path[index] === part);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
