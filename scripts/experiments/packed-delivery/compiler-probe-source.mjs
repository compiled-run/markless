const returnStatement = 'return memoizedCompile(input, () => runCompile(input));';

export function instrumentCompilerResult(source) {
	const parts = source.split(returnStatement);
	if (parts.length === 1) return { source, matched: false };
	if (parts.length !== 2) throw new Error('Found multiple compiler wrapper matches');
	return {
		source:
			parts[0] +
			'return memoizedCompile(input, () => runCompile(input)).then(result => {globalThis.__marklessCompilerResultProbe?.(input,result);return result;});' +
			parts[1],
		matched: true,
	};
}
