export function emitPublicLoadSymbolFunction(input: {
	readonly repeatSyncCall: string | null;
	readonly repeatStateName: string | null;
	readonly hasStaticTextWrites: boolean;
}) {
	const parameters = input.repeatStateName ? `root, ${input.repeatStateName}` : 'root';
	const syncStaticText = input.hasStaticTextWrites
		? '\n\t\t\t\tsyncMarklessPublicStaticText(root, context.graph);'
		: '';
	const syncRepeats = input.repeatSyncCall ? `\n\t\t\t\t${input.repeatSyncCall}` : '';
	return `function createMarklessPublicLoadSymbol(${parameters}) {\n\tconst symbols = new Map();\n\tconst createLoadedSymbol = (loaded) => function runMarklessPublicSymbol(context) {\n\t\tconst value = loaded(context);${syncStaticText}${syncRepeats}\n\t\treturn value;\n\t};\n\tfunction loadMarklessPublicSymbol(symbolId) {\n\t\tconst cached = symbols.get(symbolId);\n\t\tif (cached) return cached;\n\t\tconst loaded = loadSymbol(symbolId);\n\t\tif (isMarklessPublicThenable(loaded)) {\n\t\t\tconst pending = loaded.then((resolved) => { const symbol = createLoadedSymbol(resolved); symbols.set(symbolId, symbol); return symbol; });\n\t\t\tsymbols.set(symbolId, pending);\n\t\t\treturn pending;\n\t\t}\n\t\tconst symbol = createLoadedSymbol(loaded);\n\t\tsymbols.set(symbolId, symbol);\n\t\treturn symbol;\n\t}\n\treturn loadMarklessPublicSymbol;\n}`;
}

export function emitComponentFactory(
	name: string,
	options: {
		readonly repeatSyncCall: string | null;
		readonly repeatStateName: string | null;
		readonly repeatStateInitializer: string;
		readonly hasStaticTextWrites: boolean;
	},
) {
	const repeatStateDeclaration = options.repeatStateName
		? [`	const ${options.repeatStateName} = ${options.repeatStateInitializer};`]
		: [];
	const loadSymbolArguments = options.repeatStateName
		? `root, ${options.repeatStateName}`
		: 'root';
	const syncStaticText = options.hasStaticTextWrites
		? ['	syncMarklessPublicStaticText(root, graph);']
		: [];
	const syncRepeats = options.repeatSyncCall ? [`	${options.repeatSyncCall}`] : [];
	return [
		`export function ${name}() {`,
		'	const root = createMarklessPublicRoot();',
		'	const graph = createMarklessPublicGraph();',
		...repeatStateDeclaration,
		`	const componentLoadSymbol = createMarklessPublicLoadSymbol(${loadSymbolArguments});`,
		...syncStaticText,
		'	attachMarklessPublicStaticEvents(root, graph, componentLoadSymbol);',
		...syncRepeats,
		'	return {',
		'		root,',
		'		graph,',
		'		runtime: { async dispatch() {} },',
		'	};',
		'}',
	].join('\n');
}
