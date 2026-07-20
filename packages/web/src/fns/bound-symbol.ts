export function marklessBoundSymbolId(
	child: {
		readonly symbolPrefix?: string;
		readonly boundSymbols?: Readonly<Record<string, string>>;
	},
	baseSymbolId: string,
): string {
	return child.boundSymbols?.[baseSymbolId] ?? `${child.symbolPrefix ?? ''}${baseSymbolId}`;
}
