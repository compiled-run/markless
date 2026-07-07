type TextUpdateContext = {
	readonly domUpdate?: {
		readonly hostNodeId: string;
	};
	readonly value?: unknown;
};

export function marklessUpdateText(context: TextUpdateContext, fallbackHostNodeId: string): {
	readonly type: 'setText';
	readonly locator: string;
	readonly value: unknown;
} {
	const locator = context.domUpdate?.hostNodeId ?? fallbackHostNodeId;
	if (!locator) {
		throw Object.assign(new Error('MARKLESS_TEXT_UPDATE_RECORD_MISSING'), {
			code: 'MARKLESS_TEXT_UPDATE_RECORD_MISSING',
			site: 'text-record',
		});
	}
	return { type: 'setText', locator, value: context.value };
}
