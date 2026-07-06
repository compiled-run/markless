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
		const error = new Error('MARKLESS_TEXT_UPDATE_RECORD_MISSING: Cannot apply text update without a DOM update record.');
		Object.assign(error, {
			code: 'MARKLESS_TEXT_UPDATE_RECORD_MISSING',
			severity: 'error',
			phase: 'runtime',
			docsUrl: 'https://markless.dev/errors/MARKLESS_TEXT_UPDATE_RECORD_MISSING',
		});
		throw error;
	}
	return { type: 'setText', locator, value: context.value };
}
