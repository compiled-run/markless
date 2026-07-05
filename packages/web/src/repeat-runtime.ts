import {
	deserializeGraphValueForClient,
	type SerializedGraphPayload,
} from '@markless/serializer/decode-client';
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer/protocol';
import type { RuntimeGraph } from '@markless/runtime';

export class KeyedRepeatRuntimeError extends Error {
	readonly code = 'MARKLESS_REPEAT_KEY_DUPLICATE';
	readonly severity = 'error';
	readonly phase = 'runtime';
	readonly repeatId: string;
	readonly keyPath: ReadonlyArray<string>;
	readonly collidingValue: unknown;
	readonly docsUrl: string;

	constructor(diagnostic: {
		readonly message: string;
		readonly repeatId: string;
		readonly keyPath: ReadonlyArray<string>;
		readonly collidingValue: unknown;
		readonly docsUrl: string;
	}) {
		super(diagnostic.message);
		Object.defineProperty(this, 'message', {
			value: diagnostic.message,
			enumerable: true,
			configurable: true,
		});
		this.name = 'KeyedRepeatRuntimeError';
		this.repeatId = diagnostic.repeatId;
		this.keyPath = diagnostic.keyPath;
		this.collidingValue = diagnostic.collidingValue;
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

export async function validateKeyedRepeatPayloadKeys(input: {
	readonly state: ProtocolStatePayload;
	readonly view: Pick<ProtocolViewPayload, 'keyedRepeats'>;
}): Promise<void> {
	const entries = await Promise.all(
		input.state.cells.map(async (cell) => [
			cell.graphNodeId,
			cell.value === undefined
				? undefined
				: await deserializeGraphValueForClient(cell.value as SerializedGraphPayload),
		] as const),
	);
	const cells = new Map(entries);
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
		message: `MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key ${keyText} from ${source}.`,
		repeatId: repeat.id,
		keyPath: repeat.keyPath,
		collidingValue: key,
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
