import type { DomJournalResult } from '@markless/runtime';
import type { EventOnlyResumeSymbolContext } from '../event-only-lean/types.ts';

type TextUpdateInput = {
	readonly hostNodeId: string;
	readonly prefix?: string;
	readonly suffix?: string;
	readonly trueValue?: unknown;
	readonly falseValue?: unknown;
};

export function marklessUpdateText(
	context: EventOnlyResumeSymbolContext,
	input: TextUpdateInput,
): DomJournalResult {
	const selected =
		input.trueValue !== undefined && input.falseValue !== undefined
			? context.value
				? input.trueValue
				: input.falseValue
			: context.value;
	const value =
		input.prefix === undefined && input.suffix === undefined
			? selected
			: `${input.prefix ?? ''}${selected == null ? '' : String(selected)}${input.suffix ?? ''}`;
	return {
		type: 'setText',
		locator: context.domUpdate?.hostNodeId ?? input.hostNodeId,
		value,
	};
}
