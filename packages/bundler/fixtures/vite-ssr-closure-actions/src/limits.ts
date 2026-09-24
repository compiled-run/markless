export const LOW = 0;
export const HIGH = 3;
export const SECTIONS = [
	{ id: 'north', text: 'North notes' },
	{ id: 'south', text: 'South notes' },
] as const;

export function nextSection(key: string, current: string): string | null {
	if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
	return current === 'north' ? 'south' : 'north';
}
