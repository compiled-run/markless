import type { ProtocolViewPayload } from '@arcade/serializer';
import type { DomJournalEntry } from '@arcade/runtime';

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
			value: targetValue(input.target, input.value),
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
			value: targetValue(input.target, input.value),
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

function targetValue(
	target: Extract<DomUpdateEntryInput['target'], { readonly kind: 'text' | 'class' }>,
	value: unknown,
): unknown {
	if (target.trueValue !== undefined && target.falseValue !== undefined) {
		return value ? target.trueValue : target.falseValue;
	}
	return value;
}
