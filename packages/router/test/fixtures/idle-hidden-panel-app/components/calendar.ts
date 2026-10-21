export type Day = { readonly iso: string; readonly day: number; readonly outside: boolean };
export type Week = { readonly key: string; readonly days: ReadonlyArray<Day> };

// Six Sunday-first weeks covering the month, in UTC so the grid is the same on every machine.
export function monthGrid(year: number, month: number): Week[] {
	const first = new Date(Date.UTC(year, month, 1));
	const start = Date.UTC(year, month, 1 - first.getUTCDay());
	const weeks: Week[] = [];
	for (let week = 0; week < 6; week++) {
		const days: Day[] = [];
		for (let weekday = 0; weekday < 7; weekday++) {
			const date = new Date(start + (week * 7 + weekday) * 86_400_000);
			days.push({
				iso: date.toISOString().slice(0, 10),
				day: date.getUTCDate(),
				outside: date.getUTCMonth() !== month,
			});
		}
		weeks.push({ key: days[0]!.iso, days });
	}
	return weeks;
}
