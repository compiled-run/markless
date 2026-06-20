import type { ClientEventOnlyEntryArtifact, ClientEventOnlyEntryInput } from '../artifacts.ts';

export function emitClientEventOnlyEntry(
	input: ClientEventOnlyEntryInput,
): ClientEventOnlyEntryArtifact {
	void input;

	return {
		passId: 'client-event-only-entry',
		moduleSource: null,
		diagnostics: [],
	};
}
