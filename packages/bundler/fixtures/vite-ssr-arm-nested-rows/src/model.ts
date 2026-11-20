export type Cell = { key: string; text: string };
export type Row = { key: string; cells: Cell[] };
export type Shelf = { key: string; rows: Row[] };

// Three weeks per month, two days each; the next month keeps the last week's key and adds two.
export function weeksOf(month: number): { key: string; days: Cell[] }[] {
	return [0, 1, 2].map((w) => ({
		key: `w${month * 2 + w}`,
		days: [0, 1].map((d) => ({ key: `${month}-${w}-${d}`, text: `${month}.${w}.${d}` })),
	}));
}

export function row(key: string): Row {
	return { key, cells: [0, 1].map((c) => ({ key: `${key}${c}`, text: `${key}${c}` })) };
}

export function shelf(key: string): Shelf {
	return { key, rows: [row(`${key}a`), row(`${key}b`)] };
}
