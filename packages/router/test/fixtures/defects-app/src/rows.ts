export const sortRows = (rows: readonly number[], key: number) =>
	[...rows].sort((a, b) => (a - b) * key);
export const windowOf = (rows: readonly number[], top: number) => rows.slice(top, top + 2);
