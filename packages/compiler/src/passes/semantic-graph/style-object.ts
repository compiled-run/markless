import { parseModule } from '@tsrx/core';
import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';

/**
 * CSS properties whose bare numbers are already complete values, so a number
 * written for them must not gain `px`. Kebab-case because style object keys are
 * hyphenated before this set is consulted. Kept compatible with React's
 * unitless list so `style={{ lineHeight: 2 }}` means the same thing in both.
 */
export const UNITLESS_STYLE_PROPERTIES: ReadonlySet<string> = new Set([
	'animation-iteration-count',
	'aspect-ratio',
	'border-image-outset',
	'border-image-slice',
	'border-image-width',
	'box-flex',
	'box-flex-group',
	'box-ordinal-group',
	'column-count',
	'columns',
	'fill-opacity',
	'flex',
	'flex-grow',
	'flex-negative',
	'flex-order',
	'flex-positive',
	'flex-shrink',
	'flood-opacity',
	'font-weight',
	'grid-area',
	'grid-column',
	'grid-column-end',
	'grid-column-span',
	'grid-column-start',
	'grid-row',
	'grid-row-end',
	'grid-row-span',
	'grid-row-start',
	'line-clamp',
	'line-height',
	'opacity',
	'order',
	'orphans',
	'scale',
	'stop-opacity',
	'stroke-dasharray',
	'stroke-dashoffset',
	'stroke-miterlimit',
	'stroke-opacity',
	'stroke-width',
	'tab-size',
	'widows',
	'z-index',
	'zoom',
]);

export type StyleObjectLowering =
	| {
			readonly kind: 'static';
			readonly css: string;
	  }
	| {
			readonly kind: 'dynamic';
			readonly expressionSource: string;
			readonly valueExpressions: ReadonlyArray<AnyNode>;
	  }
	| {
			readonly kind: 'unsupported';
			readonly reason: string;
	  };

export type StyleObjectLoweringOptions = {
	readonly resolver: StyleConstResolver;
	/** Position of the style attribute expression: name resolution site for reads. */
	readonly usagePos: number;
	/** True when `node` was substituted from a same-file const, not written inline. */
	readonly referenced: boolean;
};

/** Guards accidental spread cycles between consts; real chains stay shallow. */
const MAX_STYLE_SPREAD_DEPTH = 16;

type StyleEntry =
	| {
			readonly cssName: string;
			readonly custom: boolean;
			readonly kind: 'static';
			readonly declaration: string | null;
	  }
	| {
			readonly cssName: string;
			readonly custom: boolean;
			readonly kind: 'dynamic';
			readonly valueNode: AnyNode;
			readonly valueSource: string;
	  };

/**
 * Turns one `style={{ ... }}` object literal into either the CSS text it always
 * renders, or the single expression that recombines it on every change. The
 * same result feeds the server attribute text and the browser update record, so
 * the two cannot describe different CSS. With options, referenced same-file
 * const literals may be flattened in via `...spread`, and computed keys that
 * resolve to compile-time strings are accepted.
 */
export function lowerStyleObject(
	node: AnyNode,
	source: string,
	options?: StyleObjectLoweringOptions,
): StyleObjectLowering | null {
	if (node.type !== 'ObjectExpression') return null;

	// Keyed by the resolved kebab CSS name: `WebkitTransform` and
	// `'-webkit-transform'` are one property, and the last write wins like it
	// does in rendered CSS text. Map.set keeps the first-insertion position, the
	// order a merged JS object would render its keys in.
	const entries = new Map<string, StyleEntry>();
	const failure = collectStyleEntries(node, source, options, options?.referenced === true, 0, entries);
	if (failure !== null) return unsupported(failure);

	const ordered = [...entries.values()];
	if (!ordered.some((entry) => entry.kind === 'dynamic')) {
		return {
			kind: 'static',
			css: ordered
				.map((entry) => (entry.kind === 'static' ? (entry.declaration ?? '') : ''))
				.join(''),
		};
	}

	const parts: string[] = [];
	const valueExpressions: AnyNode[] = [];
	for (const entry of ordered) {
		if (entry.kind === 'static') {
			if (entry.declaration) parts.push(escapeTemplateText(entry.declaration));
			continue;
		}
		valueExpressions.push(entry.valueNode);
		parts.push(dynamicDeclaration(entry.cssName, entry.custom, entry.valueSource));
	}

	return {
		kind: 'dynamic',
		expressionSource: `\`${parts.join('')}\``,
		valueExpressions,
	};
}

function collectStyleEntries(
	objectNode: AnyNode,
	source: string,
	options: StyleObjectLoweringOptions | undefined,
	referenced: boolean,
	depth: number,
	entries: Map<string, StyleEntry>,
): string | null {
	for (const property of asNodes(objectNode.properties)) {
		if (property.type === 'SpreadElement' || property.type === 'SpreadProperty') {
			const reason = collectSpreadEntries(property, source, options, depth, entries);
			if (reason !== null) return reason;
			continue;
		}
		if (property.type !== 'Property') {
			return 'a member that is not a plain property';
		}
		if (property.method === true || (property.kind !== undefined && property.kind !== 'init')) {
			return 'a getter, setter, or method property';
		}

		let propertyName: string | null;
		if (property.computed === true) {
			propertyName = compileTimeKeyName(property.key as AnyNode | undefined, options);
			if (propertyName === null) return 'a computed key whose name is not a compile-time string';
		} else {
			propertyName = staticPropertyName(property.key as AnyNode | undefined);
			if (propertyName === null) return 'a key that is not a plain name or string';
		}

		const value = property.value as AnyNode | undefined;
		if (!value) return 'a property with no value';
		if (
			value.type === 'ObjectExpression' ||
			value.type === 'ArrayExpression' ||
			value.type === 'ArrowFunctionExpression' ||
			value.type === 'FunctionExpression'
		) {
			return `a nested ${value.type === 'ArrayExpression' ? 'array' : 'object or function'} value on \`${propertyName}\``;
		}

		const custom = isCustomProperty(propertyName);
		const cssName = custom ? propertyName : hyphenateStyleName(propertyName);
		const literal = staticStyleValue(value);
		if (literal !== undefined) {
			entries.set(cssName, {
				cssName,
				custom,
				kind: 'static',
				declaration: staticDeclaration(cssName, custom, literal.value),
			});
			continue;
		}

		if (referenced && options) {
			const shadowed = firstShadowedRead(value, options);
			if (shadowed !== null) return shadowed;
		}
		entries.set(cssName, {
			cssName,
			custom,
			kind: 'dynamic',
			valueNode: value,
			valueSource: expressionSource(value, source),
		});
	}
	return null;
}

function collectSpreadEntries(
	property: AnyNode,
	source: string,
	options: StyleObjectLoweringOptions | undefined,
	depth: number,
	entries: Map<string, StyleEntry>,
): string | null {
	const argument = property.argument as AnyNode | undefined;
	const spreadName = argument?.type === 'Identifier' ? getIdentifierName(argument) : null;
	if (!options || !argument || !spreadName) {
		const spreadSource = argument ? `\`${expressionSource(argument, source)}\`` : 'a value';
		return `a spread of ${spreadSource}, which is not a same-file \`const\` object literal`;
	}

	const resolved = options.resolver.resolveObject(spreadName, argument.start ?? 0);
	if (!resolved) {
		return `a spread of \`${spreadName}\`, which does not resolve to a same-file \`const\` object literal`;
	}
	if (resolved.reason !== undefined) return resolved.reason;
	if (!options.resolver.sameBindingAtBothSites(spreadName, argument.start ?? 0, options.usagePos)) {
		return shadowedReadReason(spreadName);
	}
	if (depth >= MAX_STYLE_SPREAD_DEPTH) {
		return `a \`...spread\` chain deeper than ${MAX_STYLE_SPREAD_DEPTH} levels`;
	}
	return collectStyleEntries(resolved.object, source, options, true, depth + 1, entries);
}

function compileTimeKeyName(
	key: AnyNode | undefined,
	options: StyleObjectLoweringOptions | undefined,
): string | null {
	if (!key) return null;
	const literal = staticStyleValue(key);
	if (typeof literal?.value === 'string') return literal.value;
	if (!options || key.type !== 'Identifier') return null;
	const name = getIdentifierName(key);
	if (!name) return null;
	const value = options.resolver.resolveString(name, key.start ?? 0);
	if (value === null) return null;
	return options.resolver.sameBindingAtBothSites(name, key.start ?? 0, options.usagePos)
		? value
		: null;
}

function firstShadowedRead(value: AnyNode, options: StyleObjectLoweringOptions): string | null {
	for (const read of identifierReads(value)) {
		const name = getIdentifierName(read);
		if (!name) continue;
		if (!options.resolver.sameBindingAtBothSites(name, read.start ?? 0, options.usagePos)) {
			return shadowedReadReason(name);
		}
	}
	return null;
}

function shadowedReadReason(name: string): string {
	return `a read of \`${name}\` that resolves to a different binding at the style attribute than at the const declaration`;
}

function identifierReads(node: AnyNode | undefined, reads: AnyNode[] = []): AnyNode[] {
	if (!node) return reads;
	if (node.type === 'Identifier') {
		reads.push(node);
		return reads;
	}
	if (node.type === 'MemberExpression') {
		identifierReads(node.object as AnyNode | undefined, reads);
		if (node.computed === true) identifierReads(node.property as AnyNode | undefined, reads);
		return reads;
	}
	for (const child of childNodes(node)) identifierReads(child, reads);
	return reads;
}

/**
 * React's hyphenation rule, kept identical so `WebkitTransform` and
 * `msGridRow` reach the DOM as their vendor-prefixed CSS names.
 */
export function hyphenateStyleName(name: string): string {
	return name
		.replace(/([A-Z])/g, '-$1')
		.toLowerCase()
		.replace(/^ms-/, '-ms-');
}

export function isCustomProperty(name: string): boolean {
	return name.startsWith('--');
}

export function isUnitlessStyleProperty(cssName: string): boolean {
	return UNITLESS_STYLE_PROPERTIES.has(cssName);
}

function unsupported(reason: string): StyleObjectLowering {
	return { kind: 'unsupported', reason };
}

function staticPropertyName(key: AnyNode | undefined): string | null {
	if (!key) return null;
	const identifier = getIdentifierName(key);
	if (identifier) return identifier;
	const literal = staticStyleValue(key);
	return typeof literal?.value === 'string' ? literal.value : null;
}

type StyleLiteral = { readonly value: string | number | boolean | null };

function staticStyleValue(node: AnyNode | undefined): StyleLiteral | undefined {
	if (!node) return undefined;
	if (node.type === 'NullLiteral') return { value: null };
	if (
		node.type === 'Literal' ||
		node.type === 'StringLiteral' ||
		node.type === 'NumericLiteral' ||
		node.type === 'BooleanLiteral'
	) {
		const value = node.value as unknown;
		if (value === null) return { value: null };
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			return { value };
		}
		return undefined;
	}
	if (node.type === 'TemplateLiteral' && asNodes(node.expressions).length === 0) {
		const quasis = asNodes(node.quasis);
		const cooked = quasis[0]?.value as { readonly cooked?: string } | undefined;
		return typeof cooked?.cooked === 'string' ? { value: cooked.cooked } : undefined;
	}
	if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) {
		const argument = staticStyleValue(node.argument as AnyNode | undefined);
		if (typeof argument?.value !== 'number') return undefined;
		return { value: node.operator === '-' ? -argument.value : argument.value };
	}
	return undefined;
}

// null, undefined, booleans, and the empty string mean "no declaration", which
// is what React writes for them too.
function staticDeclaration(
	cssName: string,
	custom: boolean,
	value: string | number | boolean | null,
): string | null {
	if (value === null || typeof value === 'boolean') return null;
	if (typeof value === 'number') {
		const unit = custom || value === 0 || isUnitlessStyleProperty(cssName) ? '' : 'px';
		return `${cssName}:${value}${unit};`;
	}
	const text = value.trim();
	return text === '' ? null : `${cssName}:${text};`;
}

const VALUE = 'marklessStyleValue';

function dynamicDeclaration(cssName: string, custom: boolean, valueSource: string): string {
	const rendered =
		custom || isUnitlessStyleProperty(cssName)
			? VALUE
			: `(typeof ${VALUE}==='number'&&${VALUE}!==0?${VALUE}+'px':${VALUE})`;
	return [
		'${((',
		VALUE,
		')=>',
		`${VALUE}==null||${VALUE}===''||typeof ${VALUE}==='boolean'?'':`,
		`${JSON.stringify(`${cssName}:`)}+${rendered}+';'`,
		')(',
		valueSource,
		')}',
	].join('');
}

function escapeTemplateText(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

export type StyleConstObjectResolution =
	| { readonly object: AnyNode; readonly reason?: undefined }
	| { readonly object?: undefined; readonly reason: string };

/**
 * Scope-aware same-file const resolution for style objects. `resolveObject`
 * answers what one identifier means at one position: the innermost visible
 * binding wins, and a binding only resolves when the compiler can prove the
 * object it names is exactly its declared literal — a `const` with an
 * ObjectExpression initializer that is never reassigned, mutated, aliased,
 * passed into a call, exported, or used outside style attributes as more than
 * a property read. Everything else returns a named refusal or null.
 */
export type StyleConstResolver = {
	resolveObject(name: string, usagePos: number): StyleConstObjectResolution | null;
	resolveString(name: string, usagePos: number): string | null;
	sameBindingAtBothSites(name: string, declarationPos: number, usagePos: number): boolean;
};

type ScopeSpan = { readonly start: number; readonly end: number };

type StyleBinding = {
	readonly name: string;
	readonly kind: 'const' | 'let' | 'var' | 'import' | 'other';
	readonly init: AnyNode | null;
	readonly exported: boolean;
	readonly scope: ScopeSpan;
};

type StyleIdentifierUseKind =
	| 'style-value'
	| 'object-spread'
	| 'member-read'
	| 'computed-key-read'
	| 'reassigned'
	| 'member-mutated'
	| 'aliased'
	| 'call-argument'
	| 'method-receiver'
	| 'exported'
	| 'other';

type StyleIdentifierUse = {
	readonly name: string;
	readonly start: number;
	readonly use: StyleIdentifierUseKind;
};

export function createStyleConstResolver(source: string, filename: string): StyleConstResolver {
	let index: { bindings: StyleBinding[]; uses: StyleIdentifierUse[] } | null = null;
	const qualified = new Map<StyleBinding, StyleConstObjectResolution>();

	const ensureIndex = () => {
		if (!index) {
			const ast = parseModule(source, filename) as unknown as AnyNode;
			index = {
				bindings: collectStyleBindings(ast, source.length),
				uses: collectStyleIdentifierUses(ast),
			};
		}
		return index;
	};

	const resolveBindingAt = (name: string, pos: number): StyleBinding | null => {
		let innermost: StyleBinding | null = null;
		for (const binding of ensureIndex().bindings) {
			if (binding.name !== name) continue;
			if (pos < binding.scope.start || pos > binding.scope.end) continue;
			if (!innermost || binding.scope.start >= innermost.scope.start) innermost = binding;
		}
		return innermost;
	};

	const qualifyObjectConst = (binding: StyleBinding): StyleConstObjectResolution => {
		const cached = qualified.get(binding);
		if (cached) return cached;

		let result: StyleConstObjectResolution;
		if (binding.exported) {
			result = {
				reason: `the const \`${binding.name}\`, which is exported, so other files could change it`,
			};
		} else {
			const disqualifying = ensureIndex().uses.find(
				(use) =>
					use.name === binding.name &&
					!isAllowedObjectConstUse(use.use) &&
					resolveBindingAt(use.name, use.start) === binding,
			);
			result = disqualifying
				? { reason: objectConstUseReason(binding.name, disqualifying.use) }
				: { object: binding.init as AnyNode };
		}
		qualified.set(binding, result);
		return result;
	};

	return {
		resolveObject(name, usagePos) {
			const binding = resolveBindingAt(name, usagePos);
			if (!binding) return null;
			if (binding.kind === 'import') {
				return {
					reason: `the import \`${name}\` — only a \`const\` object literal declared in this file resolves here`,
				};
			}
			if (binding.kind === 'let' || binding.kind === 'var') {
				return isProvablyObjectInit(binding.init)
					? {
							reason: `a \`${binding.kind}\` binding \`${name}\` — the compiler freezes style objects at build time, so only an unmodified \`const\` qualifies`,
						}
					: null;
			}
			if (binding.kind !== 'const') return null;
			if (binding.init?.type === 'ObjectExpression') return qualifyObjectConst(binding);
			if (conditionalWithObjectBranch(binding.init)) {
				return {
					reason: `the const \`${name}\`, whose object is chosen at runtime instead of being a single object literal`,
				};
			}
			if (binding.init?.type === 'ArrayExpression') {
				return { reason: 'an array of styles' };
			}
			return null;
		},
		resolveString(name, usagePos) {
			const binding = resolveBindingAt(name, usagePos);
			if (!binding || binding.kind !== 'const' || !binding.init) return null;
			const literal = staticStyleValue(binding.init);
			return typeof literal?.value === 'string' ? literal.value : null;
		},
		sameBindingAtBothSites(name, declarationPos, usagePos) {
			return resolveBindingAt(name, declarationPos) === resolveBindingAt(name, usagePos);
		},
	};
}

function isAllowedObjectConstUse(use: StyleIdentifierUseKind): boolean {
	return use === 'style-value' || use === 'object-spread' || use === 'member-read';
}

function objectConstUseReason(name: string, use: StyleIdentifierUseKind): string {
	if (use === 'reassigned') return `the const \`${name}\`, which is reassigned after its declaration`;
	if (use === 'member-mutated') {
		return `the const \`${name}\`, whose properties are written after its declaration`;
	}
	if (use === 'aliased') {
		return `the const \`${name}\`, which is aliased into another binding or value, so the compiler cannot prove it stays unchanged`;
	}
	if (use === 'call-argument') {
		return `the const \`${name}\`, which is passed to a function that could change it`;
	}
	if (use === 'method-receiver') {
		return `the const \`${name}\`, which is used as a call receiver that could change it`;
	}
	if (use === 'exported') return `the const \`${name}\`, which is exported, so other files could change it`;
	return `the const \`${name}\`, which is used outside style attributes as more than a property read`;
}

function isProvablyObjectInit(init: AnyNode | null): boolean {
	return init?.type === 'ObjectExpression' || conditionalWithObjectBranch(init);
}

function conditionalWithObjectBranch(init: AnyNode | null | undefined): boolean {
	if (init?.type !== 'ConditionalExpression') return false;
	const branches = [init.consequent, init.alternate] as Array<AnyNode | undefined>;
	return branches.some(
		(branch) => branch?.type === 'ObjectExpression' || conditionalWithObjectBranch(branch),
	);
}

const scopeNodeTypes = new Set([
	'Program',
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
	'JSXCodeBlock',
	'BlockStatement',
	'ForStatement',
	'ForInStatement',
	'ForOfStatement',
	'CatchClause',
	'SwitchStatement',
	'StaticBlock',
]);

const functionScopeNodeTypes = new Set([
	'Program',
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
	'JSXCodeBlock',
	'StaticBlock',
]);

// Skips the same non-semantic keys as the shared walker, but keeps `id` and
// `openingElement`: declarations and attribute positions live there.
const skippedStyleWalkKeys = new Set([
	'closingElement',
	'leadingComments',
	'loc',
	'metadata',
	'parent',
	'range',
	'trailingComments',
]);

function styleWalkChildren(node: AnyNode): AnyNode[] {
	const children: AnyNode[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (skippedStyleWalkKeys.has(key)) continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (isAstNode(item)) children.push(item);
			}
			continue;
		}
		if (isAstNode(value)) children.push(value);
	}
	return children;
}

function isAstNode(value: unknown): value is AnyNode {
	return (
		typeof value === 'object' && value !== null && typeof (value as AnyNode).type === 'string'
	);
}

function collectStyleBindings(ast: AnyNode, sourceLength: number): StyleBinding[] {
	const bindings: StyleBinding[] = [];
	const moduleScope: ScopeSpan = { start: 0, end: sourceLength };

	const visit = (
		node: AnyNode,
		scopes: ReadonlyArray<ScopeSpan>,
		functionScopes: ReadonlyArray<ScopeSpan>,
		exported: boolean,
	): void => {
		let currentScopes = scopes;
		let currentFunctionScopes = functionScopes;
		if (typeof node.type === 'string' && scopeNodeTypes.has(node.type)) {
			const span: ScopeSpan = {
				start: typeof node.start === 'number' ? node.start : 0,
				end: typeof node.end === 'number' ? node.end : sourceLength,
			};
			currentScopes = [...scopes, span];
			if (functionScopeNodeTypes.has(node.type)) {
				currentFunctionScopes = [...functionScopes, span];
			}
		}
		const blockScope = currentScopes[currentScopes.length - 1] ?? moduleScope;
		const functionScope = currentFunctionScopes[currentFunctionScopes.length - 1] ?? moduleScope;

		if (node.type === 'VariableDeclaration') {
			const kind = node.kind === 'let' ? 'let' : node.kind === 'var' ? 'var' : 'const';
			const scope = kind === 'var' ? functionScope : blockScope;
			for (const declaration of asNodes(node.declarations)) {
				const id = declaration.id as AnyNode | undefined;
				const name = getIdentifierName(id);
				if (name) {
					bindings.push({
						name,
						kind,
						init: (declaration.init as AnyNode | undefined) ?? null,
						exported,
						scope,
					});
					continue;
				}
				for (const bound of destructuredBindingNames(id)) {
					bindings.push({ name: bound, kind: 'other', init: null, exported, scope });
				}
			}
		}
		if (node.type === 'ImportDeclaration') {
			for (const specifier of asNodes(node.specifiers)) {
				const local = getIdentifierName(specifier.local as AnyNode | undefined);
				if (local) {
					bindings.push({ name: local, kind: 'import', init: null, exported: false, scope: moduleScope });
				}
			}
		}
		if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
			const name = getIdentifierName(node.id as AnyNode | undefined);
			if (name) bindings.push({ name, kind: 'other', init: null, exported, scope: blockScope });
		}
		if (
			node.type === 'FunctionDeclaration' ||
			node.type === 'FunctionExpression' ||
			node.type === 'ArrowFunctionExpression'
		) {
			for (const parameter of asNodes(node.params)) {
				const own = getIdentifierName(parameter);
				const names = own ? [own] : destructuredBindingNames(parameter);
				for (const name of names) {
					bindings.push({ name, kind: 'other', init: null, exported: false, scope: blockScope });
				}
			}
		}
		if (node.type === 'CatchClause') {
			const param = node.param as AnyNode | undefined;
			const own = getIdentifierName(param);
			for (const name of own ? [own] : destructuredBindingNames(param)) {
				bindings.push({ name, kind: 'other', init: null, exported: false, scope: blockScope });
			}
		}

		const childExported =
			node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration';
		for (const child of styleWalkChildren(node)) {
			visit(child, currentScopes, currentFunctionScopes, childExported);
		}
	};

	visit(ast, [], [], false);
	return bindings;
}

function destructuredBindingNames(node: AnyNode | undefined): string[] {
	if (!node) return [];
	if (node.type === 'Identifier') {
		const name = getIdentifierName(node);
		return name ? [name] : [];
	}
	if (node.type === 'AssignmentPattern') {
		return destructuredBindingNames(node.left as AnyNode | undefined);
	}
	if (node.type === 'RestElement') {
		return destructuredBindingNames(node.argument as AnyNode | undefined);
	}
	if (node.type === 'ObjectPattern') {
		return asNodes(node.properties).flatMap((property) =>
			property.type === 'Property'
				? destructuredBindingNames(property.value as AnyNode | undefined)
				: destructuredBindingNames(property.argument as AnyNode | undefined),
		);
	}
	if (node.type === 'ArrayPattern') {
		return asNodes(node.elements).flatMap((element) => destructuredBindingNames(element));
	}
	return [];
}

function collectStyleIdentifierUses(ast: AnyNode): StyleIdentifierUse[] {
	const uses: StyleIdentifierUse[] = [];
	const parents: AnyNode[] = [];

	const visit = (node: AnyNode): void => {
		if (node.type === 'Identifier' && typeof node.name === 'string') {
			const use = classifyIdentifierUse(node, parents);
			if (use) uses.push({ name: node.name, start: node.start ?? 0, use });
		}
		parents.push(node);
		for (const child of styleWalkChildren(node)) visit(child);
		parents.pop();
	};

	visit(ast);
	return uses;
}

function classifyIdentifierUse(
	node: AnyNode,
	parents: ReadonlyArray<AnyNode>,
): StyleIdentifierUseKind | null {
	const parent = parents[parents.length - 1];
	if (!parent) return null;

	// Declaration and non-reference positions are not uses of the binding value.
	if (parent.type === 'VariableDeclarator' && parent.id === node) return null;
	if (typeof parent.type === 'string' && parent.type.startsWith('Import')) return null;
	if (parent.type === 'ExportSpecifier') return 'exported';
	if (
		parent.type === 'Property' &&
		parent.key === node &&
		parent.value !== node &&
		parent.computed !== true
	) {
		return null;
	}
	if (parent.type === 'MemberExpression' && parent.property === node && parent.computed !== true) {
		return null;
	}
	if (
		(parent.type === 'FunctionDeclaration' ||
			parent.type === 'FunctionExpression' ||
			parent.type === 'ArrowFunctionExpression' ||
			parent.type === 'ClassDeclaration' ||
			parent.type === 'ClassExpression') &&
		(parent.id === node || asNodes(parent.params).includes(node))
	) {
		return null;
	}
	if (parent.type === 'CatchClause' && parent.param === node) return null;
	if (
		(parent.type === 'LabeledStatement' ||
			parent.type === 'BreakStatement' ||
			parent.type === 'ContinueStatement') &&
		parent.label === node
	) {
		return null;
	}
	if (parent.type === 'Element' && parent.id === node) return null;
	// Binding-pattern positions declare names; an AssignmentPattern right side is
	// still a real use (a default value the object escapes into).
	if (parent.type === 'AssignmentPattern' && parent.left === node) return null;
	if (parent.type === 'RestElement' || parent.type === 'ArrayPattern') return null;
	if (
		parent.type === 'Property' &&
		parent.value === node &&
		parents[parents.length - 2]?.type === 'ObjectPattern'
	) {
		return null;
	}

	// Climb the member chain the identifier roots, so `box.a.b` classifies by
	// what happens to the whole expression.
	let expression: AnyNode = node;
	let parentIndex = parents.length - 1;
	while (parentIndex >= 0) {
		const candidate = parents[parentIndex]!;
		if (candidate.type === 'MemberExpression' && candidate.object === expression) {
			expression = candidate;
			parentIndex -= 1;
			continue;
		}
		if (candidate.type === 'ChainExpression' && candidate.expression === expression) {
			expression = candidate;
			parentIndex -= 1;
			continue;
		}
		break;
	}
	const effectiveParent = parents[parentIndex];
	const bare = expression === node;
	if (!effectiveParent) return bare ? 'other' : 'member-read';

	if (effectiveParent.type === 'AssignmentExpression') {
		if (effectiveParent.left === expression) return bare ? 'reassigned' : 'member-mutated';
		return bare ? 'aliased' : 'member-read';
	}
	if (effectiveParent.type === 'UpdateExpression' && effectiveParent.argument === expression) {
		return bare ? 'reassigned' : 'member-mutated';
	}
	if (
		effectiveParent.type === 'UnaryExpression' &&
		effectiveParent.operator === 'delete' &&
		effectiveParent.argument === expression
	) {
		return 'member-mutated';
	}
	if (effectiveParent.type === 'CallExpression' || effectiveParent.type === 'NewExpression') {
		if (effectiveParent.callee === expression) return 'method-receiver';
		return asNodes(effectiveParent.arguments).includes(expression) && !bare
			? 'member-read'
			: 'call-argument';
	}
	if (effectiveParent.type === 'SpreadElement' || effectiveParent.type === 'SpreadProperty') {
		const container = parents[parentIndex - 1];
		if (container?.type === 'ObjectExpression') return 'object-spread';
		if (container?.type === 'CallExpression' || container?.type === 'NewExpression') {
			return 'call-argument';
		}
		return bare ? 'other' : 'member-read';
	}
	if (effectiveParent.type === 'VariableDeclarator' && effectiveParent.init === expression) {
		return bare ? 'aliased' : 'member-read';
	}
	if (effectiveParent.type === 'Property' && effectiveParent.value === expression) {
		return bare ? 'aliased' : 'member-read';
	}
	if (effectiveParent.type === 'Property' && effectiveParent.key === expression) {
		return 'computed-key-read';
	}
	if (effectiveParent.type === 'MemberExpression' && effectiveParent.property === expression) {
		return 'computed-key-read';
	}
	if (
		effectiveParent.type === 'JSXExpressionContainer' ||
		effectiveParent.type === 'TSRXExpression'
	) {
		const attribute = parents[parentIndex - 1];
		if (
			attribute &&
			attribute.value === effectiveParent &&
			getIdentifierName(attribute.name as AnyNode | undefined) === 'style'
		) {
			return 'style-value';
		}
		return bare ? 'other' : 'member-read';
	}
	if (
		effectiveParent.type === 'ReturnStatement' ||
		effectiveParent.type === 'ArrowFunctionExpression' ||
		effectiveParent.type === 'ArrayExpression'
	) {
		return bare ? 'aliased' : 'member-read';
	}
	return bare ? 'other' : 'member-read';
}
