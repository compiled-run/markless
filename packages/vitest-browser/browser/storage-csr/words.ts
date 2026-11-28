export const say = (mood: string, taps: number) =>
	`${mood.startsWith('happy') ? 'Feeling happy' : 'Feeling calm'} after ${taps} taps`;
