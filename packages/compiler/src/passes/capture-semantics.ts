import { analyze, type Module } from 'yuku-analyzer';

// Capture analysis asks two factual questions about an emitted symbol source:
// which names it reads without binding them itself, and which expressions it
// calls. Both are scope/binding questions, so they are answered by running the
// source through the yuku analyzer and reading its resolved reference table
// rather than by scanning the source text.

// The analyzer wants a module, and emitted symbol sources are expressions, so
// each source is wrapped in a declaration before analysis. The declarator name
// only has to avoid colliding with an authored binding.
const SYMBOL_SOURCE_PREFIX = 'const __marklessCaptureSource = ';

// Emitted symbol sources come from TSRX component bodies, so they may still
// carry TypeScript syntax such as `as` casts and annotated parameters.
const SYMBOL_SOURCE_PATH = 'markless-capture-source.ts';

export type SymbolSourceSemantics = {
	/**
	 * Names the source reads at runtime without declaring them anywhere inside
	 * itself. A name the source binds — a parameter, a declaration at any depth,
	 * a catch variable — is not free, so it never counts as a capture. Names in
	 * type positions are erased before the browser sees them and are excluded.
	 */
	readonly freeNames: ReadonlySet<string>;
	/**
	 * True when `expression` appears in callee position anywhere in the source,
	 * including inside nested functions. Compared by source text so a member
	 * expression such as `props.onSelect` matches the read it came from.
	 */
	invokes(expression: string): boolean;
};

/**
 * Analyzing a source is native work, and capture analysis asks about the same
 * symbol source once per component-local binding. This keeps one analysis per
 * distinct source for the life of a single pass run; create a fresh reader per
 * `analyzeCaptures` call so nothing is retained between compilations.
 */
export type SymbolSourceSemanticsReader = {
	read(source: string): SymbolSourceSemantics;
};

export function createSymbolSourceSemanticsReader(): SymbolSourceSemanticsReader {
	const analyzed = new Map<string, SymbolSourceSemantics>();

	return {
		read(source) {
			const cached = analyzed.get(source);
			if (cached) return cached;

			const semantics = symbolSourceSemantics(source);
			analyzed.set(source, semantics);

			return semantics;
		},
	};
}

// A source the analyzer cannot parse carries no queryable semantics. Reporting
// nothing keeps an unparsable source from inventing captures or invocations,
// which is what the pass did before it had a semantic substrate.
const UNANALYZABLE_SOURCE: SymbolSourceSemantics = {
	freeNames: new Set(),
	invokes: () => false,
};

function symbolSourceSemantics(source: string): SymbolSourceSemantics {
	const module = analyzeSymbolSource(source);
	if (!module) return UNANALYZABLE_SOURCE;

	const calleeSources = calleeSourceText(module);

	return {
		freeNames: freeValueNames(module),
		invokes: (expression) => calleeSources.has(expression),
	};
}

function analyzeSymbolSource(source: string): Module | undefined {
	let module: Module;
	try {
		module = analyze(`${SYMBOL_SOURCE_PREFIX}${source};`, { path: SYMBOL_SOURCE_PATH });
	} catch {
		return undefined;
	}

	return module.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
		? undefined
		: module;
}

// An unresolved reference is one the analyzer could not bind to a declaration
// inside this source, which is exactly a name closed over from the component
// body that produced the symbol.
function freeValueNames(module: Module): ReadonlySet<string> {
	const names = new Set<string>();
	for (const reference of module.unresolvedReferences) {
		if (reference.inTypePosition) continue;
		names.add(reference.name);
	}

	return names;
}

function calleeSourceText(module: Module): ReadonlySet<string> {
	const callees = new Set<string>();
	for (const call of module.findAll('CallExpression')) {
		const callee = call.callee;
		if (typeof callee?.start !== 'number' || typeof callee.end !== 'number') continue;
		callees.add(module.source.slice(callee.start, callee.end));
	}

	return callees;
}
