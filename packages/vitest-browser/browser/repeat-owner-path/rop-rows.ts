export type RopRowValue = { readonly id: string; readonly label: string };

const LABELS: Record<string, string> = { a: 'alpha', b: 'bravo', c: 'charlie', d: 'delta' };

export function withRow(rows: readonly RopRowValue[], id: string): readonly RopRowValue[] {
	return [...rows, { id, label: LABELS[id] ?? id }];
}
