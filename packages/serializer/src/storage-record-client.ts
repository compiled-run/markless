import type { ProtocolStatePayload } from './protocol.ts';
import { STORAGE_PROTOCOL_VERSION } from './protocol-constants.ts';
import { isValidStorageKey } from './storage-key.ts';

export function validateStorageRecords(
	payload: ProtocolStatePayload,
	invalid: (type: 'markless/state', message: string) => Error,
): void {
	if (payload.version !== STORAGE_PROTOCOL_VERSION) return;
	if (!Array.isArray(payload.storage))
		throw invalid('markless/state', 'Invalid markless/state storage: expected array.');
	for (const entry of payload.storage) {
		if (
			typeof entry !== 'object' ||
			entry === null ||
			typeof entry.key !== 'string' ||
			!isValidStorageKey(entry.key) ||
			!payload.cells.some((cell) => cell.graphNodeId === entry.graphNodeId)
		)
			throw invalid(
				'markless/state',
				'Invalid markless/state storage: invalid storage record.',
			);
	}
}
