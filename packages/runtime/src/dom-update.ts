import type { ProtocolViewPayload } from '@arcadejs/protocol';
import type { DomJournalEntry } from './graph.ts';

export type DomUpdateEntryInput = {
	readonly locator: string;
	readonly target: NonNullable<ProtocolViewPayload['domUpdates'][number]['target']>;
	readonly value: unknown;
};

export function createDomUpdateEntry(input: DomUpdateEntryInput): DomJournalEntry {
	if (input.target.kind === 'text') {
		return {
			type: 'setText',
			locator: input.locator,
			value: input.value,
		};
	}

	if (input.target.kind === 'property') {
		return {
			type: 'setProp',
			locator: input.locator,
			name: input.target.name,
			value: input.value,
		};
	}

	if (input.target.kind === 'class') {
		return {
			type: 'setAttr',
			locator: input.locator,
			name: 'class',
			value: input.value,
		};
	}

	if (input.target.kind === 'style') {
		return {
			type: 'setAttr',
			locator: input.locator,
			name: 'style',
			value: input.value,
		};
	}

	return {
		type: 'setAttr',
		locator: input.locator,
		name: input.target.name,
		value: input.value,
	};
}
