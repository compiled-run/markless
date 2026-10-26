import { serializeStateCellValue } from '@markless/serializer';

export function marklessSerializeGraphValue(
	value: unknown,
	cell: { readonly graphNodeId: string; readonly name?: string },
) {
	return serializeStateCellValue({ ...cell, value });
}
