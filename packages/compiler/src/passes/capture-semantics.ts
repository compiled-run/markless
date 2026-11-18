import { analyze } from '@tsrx/yuku';

type Module = ReturnType<typeof analyze>;

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
	 * True when the source carried code the analyzer could not read, so
	 * `freeNames` is empty for lack of an answer rather than because the source
	 * closes over nothing. Callers must treat this as "captures unknown" and stay
	 * fail-closed; an empty `freeNames` alone cannot tell the two apart, and
	 * reading it as "no captures" silently drops every capture diagnostic the
	 * source deserved. A symbol kind that carries no source at all is not a
	 * failure: there is nothing to analyze and nothing to capture.
	 */
	readonly analysisFailed: boolean;
	/**
	 * True when `expression` appears in callee position anywhere in the source,
	 * including inside nested functions. Compared by source text so a member
	 * expression such as `props.onSelect` matches the read it came from.
	 */
	invokes(expression: string): boolean;
	/**
	 * The property names `name` is read through when every free use of it is a
	 * static member read (`props.title`, `props['title']`), or null when any use
	 * passes, spreads, writes or indexes it dynamically.
	 */
	staticMemberKeys(name: string): ReadonlySet<string> | null;
	/** The source with nested functions blanked out: what runs on its own turn. Absent when the source is not an analyzable function. */
	readonly ownTurnSource?: string;
	/**
	 * The first use of the free name `name` (or of `name.key`, when `name` is a whole props object) that is
	 * not provably safe while its value is undefined: a call or member read no `?.` or guard protects, or any
	 * use outside the positions that only test or hand on the value. Null when every use is safe.
	 */
	absentUse(name: string, key?: string): AbsentUse | null;
	/** The root name and static keys of a source that is one member chain (`item.name`, `props['item']`), or null. */
	readonly memberChain: { readonly root: string; readonly keys: ReadonlyArray<string> } | null;
};

export type AbsentUse = {
	readonly kind: 'call' | 'member' | 'use';
	/** The code that would throw, as written. */
	readonly source: string;
	/** Where that code starts in the analyzed source. */
	readonly offset: number;
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
// which is what the pass did before it had a semantic substrate - but the empty
// answer is flagged as a failure so callers refuse rather than read it as proof
// that the source captures nothing.
const UNANALYZABLE_SOURCE: SymbolSourceSemantics = {
	freeNames: new Set(),
	analysisFailed: true,
	invokes: () => false,
	staticMemberKeys: () => null,
	absentUse: (name) => ({ kind: 'use', source: name, offset: 0 }),
	memberChain: null,
};

// Several symbol kinds (`async-boundary-update`, `branch-update`) carry no
// source text at all. There is nothing to analyze and nothing to capture, so an
// empty answer here is the true answer, not a failed reading of one.
const SOURCELESS_SYMBOL: SymbolSourceSemantics = {
	freeNames: new Set(),
	analysisFailed: false,
	invokes: () => false,
	staticMemberKeys: () => new Set(),
	absentUse: () => null,
	memberChain: null,
};

function symbolSourceSemantics(source: string): SymbolSourceSemantics {
	if (source.trim() === '') return SOURCELESS_SYMBOL;

	const module = analyzeSymbolSource(source);
	if (!module) return UNANALYZABLE_SOURCE;

	const calleeSources = calleeSourceText(module);
	const absentUses = new Map<string, AbsentUse | null>();

	return {
		freeNames: freeValueNames(module),
		analysisFailed: false,
		invokes: (expression) => calleeSources.has(expression),
		staticMemberKeys: (name) => staticMemberKeys(module, name),
		ownTurnSource: ownTurnSource(module, source),
		absentUse(name, key) {
			const cacheKey = `${name}\0${key ?? ''}`;
			if (!absentUses.has(cacheKey)) absentUses.set(cacheKey, firstAbsentUse(module, name, key));
			return absentUses.get(cacheKey)!;
		},
		memberChain: memberChain(module),
	};
}

const FUNCTION_NODES = ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'] as const;

function ownTurnSource(module: Module, source: string): string | undefined {
	const outer = module.findAll('VariableDeclarator')[0]?.init as
		| { readonly type?: string; readonly start: number; readonly end: number }
		| null
		| undefined;
	if (!outer || !(FUNCTION_NODES as ReadonlyArray<string>).includes(outer.type ?? '')) return undefined;
	let own = module.source;
	for (const nested of module.findAll(FUNCTION_NODES)) {
		if (nested.start <= outer.start || nested.end > outer.end) continue;
		own = own.slice(0, nested.start) + ' '.repeat(nested.end - nested.start) + own.slice(nested.end);
	}
	return own.slice(SYMBOL_SOURCE_PREFIX.length, SYMBOL_SOURCE_PREFIX.length + source.length);
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

function staticMemberKeys(module: Module, name: string): ReadonlySet<string> | null {
	const keys = new Set<string>();
	for (const reference of module.unresolvedReferences) {
		if (reference.inTypePosition || reference.name !== name) continue;
		if (reference.isWrite) return null;
		const member = module.parentOf(reference.node) as MemberNode | null;
		if (!member || member.type !== 'MemberExpression' || member.object !== reference.node)
			return null;
		const key = staticMemberKey(member);
		if (key === null || isAssignmentTarget(module, member)) return null;
		keys.add(key);
	}
	return keys;
}

type MemberNode = {
	readonly type: string;
	readonly object?: unknown;
	readonly property?: { readonly type?: string; readonly name?: string; readonly value?: unknown };
	readonly computed?: boolean;
};

function staticMemberKey(member: MemberNode): string | null {
	const property = member.property;
	if (!property) return null;
	if (!member.computed) return property.type === 'Identifier' && property.name ? property.name : null;
	return (property.type === 'Literal' || property.type === 'StringLiteral') &&
		typeof property.value === 'string'
		? property.value
		: null;
}

function isAssignmentTarget(module: Module, member: MemberNode): boolean {
	const parent = module.parentOf(member as never) as {
		readonly type?: string;
		readonly left?: unknown;
		readonly argument?: unknown;
	} | null;
	if (!parent) return false;
	if (parent.type === 'AssignmentExpression') return parent.left === member;
	if (parent.type === 'UpdateExpression') return parent.argument === member;
	return parent.type === 'UnaryExpression' && (parent as { operator?: string }).operator === 'delete';
}

type AstNode = {
	readonly type: string;
	readonly start: number;
	readonly end: number;
	readonly [field: string]: unknown;
};

const asAst = (value: unknown): AstNode | undefined =>
	typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string'
		? (value as AstNode)
		: undefined;

const TRANSPARENT = new Set([
	'ParenthesizedExpression',
	'ChainExpression',
	'TSNonNullExpression',
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSTypeAssertion',
]);

function memberChain(module: Module): SymbolSourceSemantics['memberChain'] {
	let node = asAst(module.findAll('VariableDeclarator')[0]?.init);
	const keys: string[] = [];
	while (node && (TRANSPARENT.has(node.type) || node.type === 'MemberExpression')) {
		if (node.type === 'MemberExpression') {
			const key = staticMemberKey(node as unknown as MemberNode);
			if (key === null) return null;
			keys.unshift(key);
			node = asAst(node.object);
		} else node = asAst(node.expression);
	}
	return node?.type === 'Identifier' ? { root: String(node.name), keys } : null;
}

function firstAbsentUse(module: Module, name: string, key: string | undefined): AbsentUse | null {
	const parentOf = (node: AstNode) => asAst(module.parentOf(node as never));
	const roots = new Set<AstNode>();
	for (const reference of module.unresolvedReferences) {
		if (reference.inTypePosition || reference.name !== name) continue;
		const node = reference.node as unknown as AstNode;
		if (key === undefined) {
			roots.add(node);
			continue;
		}
		const member = parentOf(node);
		if (member?.type === 'MemberExpression' && member.object === node && staticMemberKey(member as unknown as MemberNode) === key)
			roots.add(member);
	}
	const valueOf = (node: AstNode | undefined): AstNode | undefined => {
		let current = node;
		while (current && TRANSPARENT.has(current.type)) current = asAst(current.expression);
		return current;
	};
	const isRoot = (node: AstNode | undefined) => {
		const value = valueOf(node);
		return value !== undefined && roots.has(value);
	};
	const rootOf = (node: AstNode | undefined): AstNode | undefined => {
		let current = valueOf(node);
		while (current?.type === 'MemberExpression' && !roots.has(current)) current = valueOf(asAst(current.object));
		return current;
	};
	const isNullish = (node: AstNode | undefined) =>
		(node?.type === 'Identifier' && node.name === 'undefined') || (node?.type === 'Literal' && node.value === null);
	const isUndefinedLiteral = (node: AstNode | undefined) => node?.type === 'Identifier' && node.name === 'undefined';
	const isTypeofRoot = (node: AstNode | undefined) =>
		node?.type === 'UnaryExpression' && node.operator === 'typeof' && isRoot(asAst(node.argument));
	const comparesNullish = (node: AstNode, loose: boolean) => {
		const left = valueOf(asAst(node.left));
		const right = valueOf(asAst(node.right));
		const pair = (a: AstNode | undefined, b: AstNode | undefined) =>
			(isRoot(a) && (loose ? isNullish(b) : isUndefinedLiteral(b))) ||
			(isTypeofRoot(a) && b?.type === 'Literal' && b.value === 'undefined');
		return pair(left, right) || pair(right, left);
	};
	// Truthy only while the prop is there: the prop itself, a read of a field through it, or a check that it is defined.
	const provesPresent = (test: AstNode | undefined): boolean => {
		const node = valueOf(test);
		if (!node) return false;
		if (isRoot(node) || (node.type === 'MemberExpression' && roots.has(rootOf(node)!))) return true;
		if (node.type === 'UnaryExpression' && node.operator === '!') return provesAbsent(asAst(node.argument));
		if (node.type === 'LogicalExpression' && node.operator === '&&')
			return provesPresent(asAst(node.left)) || provesPresent(asAst(node.right));
		if (node.type === 'BinaryExpression' && (node.operator === '!==' || node.operator === '!='))
			return comparesNullish(node, node.operator === '!=');
		return false;
	};
	// Falsy only while the prop is there.
	const provesAbsent = (test: AstNode | undefined): boolean => {
		const node = valueOf(test);
		if (!node) return false;
		if (node.type === 'UnaryExpression' && node.operator === '!') return provesPresent(asAst(node.argument));
		if (node.type === 'LogicalExpression' && node.operator === '||')
			return provesAbsent(asAst(node.left)) || provesAbsent(asAst(node.right));
		if (node.type === 'BinaryExpression' && (node.operator === '===' || node.operator === '=='))
			return comparesNullish(node, node.operator === '==');
		return false;
	};
	const exits = (statement: AstNode | undefined): boolean => {
		if (!statement) return false;
		if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') return true;
		if (statement.type !== 'BlockStatement') return false;
		const body = (statement.body as unknown[]).map(asAst);
		return exits(body.at(-1));
	};
	// An `if` that leaves the function while the prop is missing guards every statement after it.
	const earlierExitGuards = (block: AstNode, statement: AstNode) => {
		const body = ((block.body as unknown[] | undefined) ?? []).map(asAst);
		for (const earlier of body) {
			if (!earlier || earlier === statement) return false;
			if (earlier.type === 'IfStatement' && provesAbsent(asAst(earlier.test)) && exits(asAst(earlier.consequent)))
				return true;
		}
		return false;
	};
	const guarded = (node: AstNode): boolean => {
		let child = node;
		for (let parent = parentOf(child); parent; child = parent, parent = parentOf(parent)) {
			if (parent.type === 'ConditionalExpression' || parent.type === 'IfStatement') {
				if (parent.consequent === child && provesPresent(asAst(parent.test))) return true;
				if (parent.alternate === child && provesAbsent(asAst(parent.test))) return true;
			}
			if (parent.type === 'LogicalExpression' && parent.right === child) {
				if (parent.operator === '&&' && provesPresent(asAst(parent.left))) return true;
				if (parent.operator === '||' && provesAbsent(asAst(parent.left))) return true;
			}
			if (parent.type === 'BlockStatement' && earlierExitGuards(parent, child)) return true;
		}
		return false;
	};
	const parentPast = (node: AstNode): { node: AstNode; parent: AstNode | undefined } => {
		let current = node;
		let parent = parentOf(current);
		while (parent && TRANSPARENT.has(parent.type) && parent.type !== 'ChainExpression') {
			current = parent;
			parent = parentOf(parent);
		}
		return { node: current, parent };
	};
	// Positions that only test the value or hand it on as it is, which an undefined value passes through as it would in JavaScript.
	const flowsSafely = (start: AstNode): boolean => {
		const { node, parent } = parentPast(start);
		if (!parent) return true;
		switch (parent.type) {
			case 'IfStatement':
			case 'WhileStatement':
			case 'DoWhileStatement':
			case 'ForStatement':
				return parent.test === node;
			case 'ConditionalExpression':
				return parent.test === node || flowsSafely(parent);
			case 'ChainExpression':
			case 'LogicalExpression':
				return flowsSafely(parent);
			case 'SequenceExpression':
				return (parent.expressions as unknown[]).at(-1) !== node || flowsSafely(parent);
			case 'UnaryExpression':
				return parent.operator === '!' || parent.operator === 'typeof' || parent.operator === 'void';
			case 'BinaryExpression':
				return ['===', '!==', '==', '!='].includes(String(parent.operator));
			case 'TemplateLiteral':
			case 'ExpressionStatement':
			case 'ReturnStatement':
			case 'ArrayExpression':
				return true;
			case 'CallExpression':
			case 'NewExpression':
				return parent.callee !== node;
			case 'ArrowFunctionExpression':
				return parent.body === node;
			case 'Property':
				return parent.value === node && parentOf(parent)?.type === 'ObjectExpression';
			case 'AssignmentExpression': {
				// Handed to a name the handler did not declare: a state write, never an alias the handler reads into later.
				const left = asAst(parent.left);
				return (
					parent.right === node &&
					parent.operator === '=' &&
					left?.type === 'Identifier' &&
					module.unresolvedReferences.some((reference) => (reference.node as unknown) === left)
				);
			}
			default:
				return false;
		}
	};
	const useAt = (kind: AbsentUse['kind'], node: AstNode): AbsentUse => ({
		kind,
		source: module.source.slice(node.start, node.end),
		offset: node.start - SYMBOL_SOURCE_PREFIX.length,
	});
	for (const root of [...roots].sort((left, right) => left.start - right.start)) {
		const { node, parent } = parentPast(root);
		const dereference =
			parent?.type === 'MemberExpression' && parent.object === node
				? 'member'
				: parent?.type === 'CallExpression' && parent.callee === node
					? 'call'
					: null;
		if (dereference) {
			if (parent!.optional === true || guarded(parent!)) continue;
			return useAt(dereference, parent!);
		}
		if (!flowsSafely(root)) return useAt('use', parent ?? root);
	}
	return null;
}
