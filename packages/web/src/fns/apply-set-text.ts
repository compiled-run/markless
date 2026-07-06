type TextElement = {
	textContent?: string | null;
};

type SetTextEntry = {
	readonly type: 'setText';
	readonly locator: string;
	readonly value: unknown;
};

export function marklessApplySetText(result: unknown, elementsByHostId: Map<string, TextElement>): void {
	if (!result || typeof result === 'function') return;
	const entries = Array.isArray(result) ? result : [result];
	for (const entry of entries as SetTextEntry[]) {
		if (entry.type !== 'setText') throw marklessSetTextError('journal-type');
		const target = elementsByHostId.get(entry.locator);
		if (target) target.textContent = entry.value == null ? '' : String(entry.value);
	}
}

function marklessSetTextError(site: string): Error {
	return Object.assign(new Error('MARKLESS_SCALAR_LEAN_ESCALATE'), {
		code: 'MARKLESS_SCALAR_LEAN_ESCALATE',
		site,
	});
}
