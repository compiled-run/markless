import { analyze } from 'yuku-analyzer';

type FragmentKind = 'expression' | 'declaration';
type Dependencies = {
	readonly names: ReadonlySet<string>;
	readonly analysisFailed: boolean;
};

export function createResidueDependencyReader() {
	const cache = new Map<string, Dependencies>();
	return (source: string, kind: FragmentKind): Dependencies => {
		const key = `${kind}:${source}`;
		const cached = cache.get(key);
		if (cached) return cached;
		let result: Dependencies;
		try {
			const module = analyze(kind === 'expression' ? `(${source});` : source, {
				path: 'markless-residue.ts',
			});
			result = {
				names: new Set(
					module.unresolvedReferences
						.filter((reference) => !reference.inTypePosition)
						.map((reference) => reference.name),
				),
				analysisFailed: module.diagnostics.some(
					(diagnostic) => diagnostic.severity === 'error',
				),
			};
		} catch {
			result = { names: new Set(), analysisFailed: true };
		}
		cache.set(key, result);
		return result;
	};
}

export function residueReferences(dependencies: Dependencies, name: string): boolean {
	return dependencies.analysisFailed || dependencies.names.has(name);
}
