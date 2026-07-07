export type CatalogHelperImport = {
	readonly module: string;
	readonly names: ReadonlyArray<string>;
};

export function emitCatalogHelperImports(
	source: string,
	imports: ReadonlyArray<CatalogHelperImport>,
): string[] {
	return imports.flatMap((entry) => {
		const names = entry.names.filter((name) => referencesIdentifier(source, name));
		return names.length > 0
			? [`import { ${names.join(', ')} } from '@markless/web/fns/${entry.module}';`]
			: [];
	});
}

function referencesIdentifier(source: string, name: string): boolean {
	return new RegExp(`\\b${name}\\b`).test(source);
}

export const stateRuntimeImports = {
	module: 'state',
	names: ['marklessCloneState', 'marklessStateValue'],
} as const satisfies CatalogHelperImport;
