// After a chunk runs, it evaluates these packs a task later; the router reads the same suffix to preload them.
export function warmPacksSuffix(specifiers: readonly string[]): string {
	return `setTimeout(()=>{for(const pack of[${specifiers.map((specifier) => `import(${JSON.stringify(specifier)})`).join(',')}])pack.catch(()=>{})});`;
}

const WARM_PACKS = /setTimeout\(\(\)=>\{for\((?:const|let|var) ([\w$]+) of\[((?:import\([^)]*\),?)+)\]\)\1\.catch\(\(\)=>\{\}\)\}\)/g;
const IMPORT_SPECIFIER = /import\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

/** The packs a chunk evaluates a task after it runs, read from `warmPacksSuffix` before or after minifying. */
export function warmEvaluatedImports(code: string): string[] {
	const specifiers: string[] = [];
	for (const warm of code.matchAll(WARM_PACKS))
		for (const target of warm[2]!.matchAll(IMPORT_SPECIFIER)) specifiers.push(target[1]!);
	return specifiers;
}

