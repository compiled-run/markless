import {
	deserializeGraphValue,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
	type SerializedGraphPayload,
} from '@markless/serializer';
import type { RuntimeGraph } from '@markless/runtime';

export class KeyedRepeatRuntimeError extends Error {
	readonly code = 'MARKLESS_REPEAT_KEY_DUPLICATE';
	readonly severity = 'error';
	readonly phase = 'runtime';
	readonly title: string;
	readonly why: string;
	readonly repeatId: string;
	readonly keyPath: ReadonlyArray<string>;
	readonly collidingValue: unknown;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;

	constructor(diagnostic: {
		readonly title: string;
		readonly message: string;
		readonly why: string;
		readonly repeatId: string;
		readonly keyPath: ReadonlyArray<string>;
		readonly collidingValue: unknown;
		readonly suggestions: ReadonlyArray<{ readonly message: string }>;
		readonly docsUrl: string;
	}) {
		super(diagnostic.message);
		Object.defineProperty(this, 'message', {
			value: diagnostic.message,
			enumerable: true,
			configurable: true,
		});
		this.name = 'KeyedRepeatRuntimeError';
		this.title = diagnostic.title;
		this.why = diagnostic.why;
		this.repeatId = diagnostic.repeatId;
		this.keyPath = diagnostic.keyPath;
		this.collidingValue = diagnostic.collidingValue;
		this.suggestions = diagnostic.suggestions;
		this.docsUrl = diagnostic.docsUrl;
	}
}

export type RuntimeKeyedRepeatRecord = NonNullable<ProtocolViewPayload['keyedRepeats']>[number];

export function validateKeyedRepeatGraphKeys(
	graph: Pick<RuntimeGraph, 'read'>,
	view: Pick<ProtocolViewPayload, 'keyedRepeats'>,
): void {
	for (const repeat of view.keyedRepeats ?? []) {
		assertUniqueRepeatKeys(repeat, readKeyedRepeatCollection(graph, repeat));
	}
}

export function validateKeyedRepeatPayloadKeys(input: {
	readonly state: ProtocolStatePayload;
	readonly view: Pick<ProtocolViewPayload, 'keyedRepeats'>;
}): void {
	const cells = new Map(
		input.state.cells.map((cell) => [
			cell.graphNodeId,
			cell.value === undefined
				? undefined
				: deserializeGraphValue(cell.value as SerializedGraphPayload),
		]),
	);
	validateKeyedRepeatGraphKeys(
		{
			read(graphNodeId, path = []) {
				return readPath(cells.get(graphNodeId), path);
			},
		},
		input.view,
	);
}

export function readKeyedRepeatCollection(
	graph: Pick<RuntimeGraph, 'read'>,
	repeat: RuntimeKeyedRepeatRecord,
): ReadonlyArray<unknown> {
	if (!repeat.collectionGraphNodeId) return [];

	const value = graph.read(repeat.collectionGraphNodeId, repeat.collectionPath);
	if (Array.isArray(value)) return value;
	return Array.from((value ?? []) as Iterable<unknown>);
}

export function repeatItemKey(
	item: unknown,
	repeat: RuntimeKeyedRepeatRecord,
): unknown {
	return readPath(item, repeat.keyPath);
}

export function findRepeatItemByKey(
	items: ReadonlyArray<unknown>,
	repeat: RuntimeKeyedRepeatRecord,
	key: unknown,
): unknown {
	for (const item of items) {
		if (Object.is(repeatItemKey(item, repeat), key)) return item;
	}
	return undefined;
}

function assertUniqueRepeatKeys(
	repeat: RuntimeKeyedRepeatRecord,
	items: ReadonlyArray<unknown>,
): void {
	const seen = new Map<unknown, true>();
	for (const item of items) {
		const key = repeatItemKey(item, repeat);
		if (seen.has(key)) throw duplicateRepeatKeyError(repeat, key);
		seen.set(key, true);
	}
}

function duplicateRepeatKeyError(
	repeat: RuntimeKeyedRepeatRecord,
	key: unknown,
): KeyedRepeatRuntimeError {
	const source = `${repeat.itemName}.${repeat.keyPath.join('.')}`;
	const keyText = JSON.stringify(key);
	return new KeyedRepeatRuntimeError({
		title: 'Two rows share the same @for key',
		message: `Two items of ${repeat.collectionGraphNodeId} produced the same key ${keyText} from ${source}. Rows with the same key cannot be told apart, so one of them would silently replace the other.`,
		why: 'The key is each row identity across reorder, insert, delete, and resume; duplicate identities make row state and DOM ownership ambiguous.',
		repeatId: repeat.id,
		keyPath: repeat.keyPath,
		collidingValue: key,
		suggestions: [
			{
				message:
					'Key by a field that is unique per item, or make the key compound where the data allows it. If the data has no unique field, key by position with index i; key i.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE',
	});
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let cursor = value as Record<string, unknown> | null | undefined;
	for (const key of path) {
		if (cursor == null) return undefined;
		cursor = cursor[key] as Record<string, unknown> | null | undefined;
	}
	return cursor;
}
