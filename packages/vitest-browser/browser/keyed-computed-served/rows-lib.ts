export type Row = { readonly id: string; readonly label: string };

let runs = 0;

export function matchingRows(rows: ReadonlyArray<Row>, query: string): ReadonlyArray<Row> {
	runs += 1;
	return rows.filter((row) => row.label.includes(query));
}

export function rowsLibRuns(): number {
	return runs;
}
