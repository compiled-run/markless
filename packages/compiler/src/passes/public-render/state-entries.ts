import { deserializeGraphValue } from '@markless/serializer';
import type { SerializedGraphPayload } from '@markless/serializer';
import type { PublicRenderModuleInput } from '../../artifacts.ts';

type ProtocolState = PublicRenderModuleInput['protocolState'];

export function emitDirectPublicStateEntries(protocolState: ProtocolState): string | null {
	const entries: string[] = [];

	for (const cell of protocolState.cells) {
		if (cell.valueKind === 'unknown') return null;
		if (cell.value === undefined) return null;

		const value = deserializeGraphValue(cell.value as SerializedGraphPayload);
		if (!isDirectPublicLiteralValue(value)) return null;
		entries.push(`[${JSON.stringify(cell.graphNodeId)}, ${literalExpression(value)}]`);
	}

	return `[${entries.join(',')}]`;
}

export function isDirectPublicLiteralValue(value: unknown, seen = new Set<object>()): boolean {
	if (value === null) return true;
	if (typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);

	if (Array.isArray(value)) {
		if (seen.has(value)) return false;
		seen.add(value);
		return value.every((item) => isDirectPublicLiteralValue(item, seen));
	}

	if (value && typeof value === 'object') {
		if (seen.has(value)) return false;
		if (!isDirectPublicPlainObject(value)) return false;

		seen.add(value);
		return Object.values(value).every((item) => isDirectPublicLiteralValue(item, seen));
	}

	return false;
}

function literalExpression(value: unknown): string {
	if (value === undefined) return 'undefined';
	return JSON.stringify(value);
}

function isDirectPublicPlainObject(value: object): value is Record<string, unknown> {
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
