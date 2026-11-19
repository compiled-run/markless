export type CheckIn = {
	readonly id: string;
	readonly site: string;
	readonly note: string;
	readonly photo: string;
	readonly latitude: string;
	readonly longitude: string;
	readonly at: string;
};

export const SITES = ['North yard', 'Pump house', 'East fence', 'Loading dock'] as const;

export const SHARE_BASE = 'https://fieldnotes.example';

export function parseCheckIns(text: string): CheckIn[] {
	try {
		const value: unknown = JSON.parse(text);
		return Array.isArray(value) ? (value as CheckIn[]) : [];
	} catch {
		return [];
	}
}

export function addCheckIn(
	text: string,
	entry: Omit<CheckIn, 'id' | 'at'>,
): { saved: string; id: string } {
	const id = Date.now().toString(36);
	return {
		saved: JSON.stringify([
			{ ...entry, id, at: new Date().toISOString() },
			...parseCheckIns(text),
		]),
		id,
	};
}

export function when(iso: string | undefined): string {
	const date = new Date(iso ?? '');
	return Number.isNaN(date.getTime())
		? ''
		: new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function coordinates(
	latitude: number,
	longitude: number,
): { latitude: string; longitude: string } {
	return { latitude: latitude.toFixed(5), longitude: longitude.toFixed(5) };
}
