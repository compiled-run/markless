import {
	decodePayloadScriptsWithVersion,
	invalidPayloadShapeError,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
} from './protocol-validation.ts';
import { STORAGE_PROTOCOL_VERSION } from './protocol-constants.ts';
import { isValidStorageKey } from './storage-key.ts';

export * from './protocol-validation.ts';

export function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts {
	const decoded = decodePayloadScriptsWithVersion(input, true);
	if (decoded.state.version !== STORAGE_PROTOCOL_VERSION) return decoded;
	const cellIds = new Set(decoded.state.cells.map((cell) => cell.graphNodeId));
	const storage = (decoded.state as unknown as Record<string, unknown>).storage;
	if (!Array.isArray(storage))
		throw invalidPayloadShapeError(
			'markless/state',
			'Invalid markless/state payload: expected storage array.',
		);
	for (const [index, entry] of storage.entries()) {
		const context = `markless/state storage[${index}]`;
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
			throw invalidPayloadShapeError(
				'markless/state',
				`Invalid ${context}: expected object.`,
			);
		const record = entry as Record<string, unknown>;
		if (typeof record.graphNodeId !== 'string')
			throw invalidPayloadShapeError(
				'markless/state',
				`Invalid ${context}: expected graphNodeId string.`,
			);
		if (typeof record.key !== 'string')
			throw invalidPayloadShapeError(
				'markless/state',
				`Invalid ${context}: expected key string.`,
			);
		if (!cellIds.has(record.graphNodeId))
			throw invalidPayloadShapeError(
				'markless/state',
				`Invalid ${context}: graphNodeId must match a state cell.`,
			);
		if (!isValidStorageKey(record.key))
			throw invalidPayloadShapeError(
				'markless/state',
				`Invalid ${context}: key must be a verbatim key or a derived markless:<identifier>.`,
			);
	}
	return decoded;
}
