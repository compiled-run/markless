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
	// Aliased entries ('imported as local') are used under the LOCAL name.
	const local = name.includes(' as ') ? name.split(' as ')[1]! : name;
	return new RegExp(`\\b${local}\\b`).test(source);
}

export const stateRuntimeImports = {
	module: 'state',
	names: [
		'marklessCloneState',
		'marklessSelectStateNodes',
		'marklessStateValue',
		'marklessSsrServeComputed',
	],
} as const satisfies CatalogHelperImport;
