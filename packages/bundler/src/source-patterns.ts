import { char, charIn, createRegExp, exactly } from 'magic-regexp';

const pathSeparator = charIn('/\\');
const optionalQueryOrHashSuffix = charIn('?#').and(char.times.any()).optionally();
const optionalVirtualModulePrefix = exactly('\0').optionally();

export const bundlerRuntimePackageChunkMatcher = createRegExp(
	pathSeparator,
	'@arcadejs',
	pathSeparator,
	'runtime',
	pathSeparator,
);
export const bundlerSymbolVirtualModuleMatcher = createRegExp(exactly('virtual:arcade:symbol:'));
export const bundlerTsrxSourceFileWithQueryMatcher = createRegExp(
	exactly('.tsrx', optionalQueryOrHashSuffix).at.lineEnd(),
);
export const bundlerVitePreloadHelperMatcher = createRegExp(
	optionalVirtualModulePrefix
		.and('vite/preload-helper', exactly('.js').optionally())
		.at.lineStart()
		.at.lineEnd(),
);
