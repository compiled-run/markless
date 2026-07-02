import type { ProtocolViewPayload } from '@markless/serializer';
import type { DomJournalEntry } from '@markless/runtime';

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
			value: textTargetValue(input.target, input.value),
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
			value: conditionalTargetValue(input.target, input.value),
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

function textTargetValue(
	target: Extract<DomUpdateEntryInput['target'], { readonly kind: 'text' }>,
	value: unknown,
): unknown {
	const mapped = conditionalTargetValue(target, value);
	if (target.prefix === undefined && target.suffix === undefined) return mapped;

	return `${target.prefix ?? ''}${mapped == null ? '' : String(mapped)}${target.suffix ?? ''}`;
}

function conditionalTargetValue(
	target: Extract<DomUpdateEntryInput['target'], { readonly kind: 'text' | 'class' }>,
	value: unknown,
): unknown {
	if (target.trueValue !== undefined && target.falseValue !== undefined) {
		return value ? target.trueValue : target.falseValue;
	}
	return value;
}
