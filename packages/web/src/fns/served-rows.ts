import { MARKLESS_FIRST_INTERACTION_ROW_LIMIT } from '../first-interaction-rows.ts';

type CollectionRecord = {
	readonly collectionGraphNodeId?: string;
	readonly collectionPath?: ReadonlyArray<string>;
};

type RenderState = {
	readonly cells?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly directValue?: unknown;
	}>;
	readonly computed?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly snapshot?: unknown;
	}>;
};

/** Rows a render served for these keyed repeats, read from the render's own values. */
export function servedRowCount(
	repeats: ReadonlyArray<CollectionRecord>,
	state: RenderState | undefined,
): number {
	let rows = 0;
	for (const repeat of repeats) {
		const node = repeat.collectionGraphNodeId;
		if (!node) continue;
		let value: unknown =
			state?.computed?.find((entry) => entry.graphNodeId === node)?.snapshot ??
			state?.cells?.find((entry) => entry.graphNodeId === node)?.directValue;
		for (const key of repeat.collectionPath ?? [])
			value = value == null ? undefined : (value as Record<string, unknown>)[key];
		if (Array.isArray(value)) rows += value.length;
	}
	return rows;
}

/** Whether a page serving this many rows resumes at load, as it would with no streamed answers deferred. */
export function resumesAtLoad(rows: number): boolean {
	return rows > MARKLESS_FIRST_INTERACTION_ROW_LIMIT;
}
