export type KrgrRow = { readonly id: string; readonly label: string };

const LABELS: Record<string, string> = { a: 'alpha', b: 'bravo', c: 'charlie', d: 'delta' };

export function withRow(rows: readonly KrgrRow[], id: string): readonly KrgrRow[] {
	return [...rows, { id, label: LABELS[id] ?? id }];
}

export function withoutRow(rows: readonly KrgrRow[], id: string): readonly KrgrRow[] {
	return rows.filter((row) => row.id !== id);
}
