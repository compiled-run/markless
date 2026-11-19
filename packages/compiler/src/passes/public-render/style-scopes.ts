import { parse as parseCss } from 'yuku-css';
import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { rawElementText } from '../../ast/raw-text.ts';
import { getComponentFunction } from '../../ast/tsrx.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';
import { hyphenateStyleName } from '../semantic-graph/style-object.ts';
import { componentMarkupRoot } from './component-markup-root.ts';
import { unsupportedRenderConstructDiagnostic } from './diagnostics.ts';

// Scoped <style> blocks (TSRX spec 4.5, https://tsrx.dev/specification): each component's blocks
// share one hash class, so no rule reaches another component, in this file or any other.
export type PublicRenderStyleScope = {
	readonly scopeId: string;
	readonly cssText: string;
};

type StyleScopeCollection = {
	readonly styleScopes: ReadonlyArray<PublicRenderStyleScope>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

type CompiledStyles = StyleScopeCollection & { readonly keyframes: ReadonlySet<string> };

export function collectStyleScopes(
	root: AnyNode,
	filename: string,
	moduleId: string,
): StyleScopeCollection {
	return compileStyleNodes(findStyleNodes(root), filename, moduleId);
}

// Every component's sheet ships with the module, not only the render root's: a component mints its own
// hash class onto its elements, so a sheet left behind here paints nothing while the class is stamped.
export function collectModuleStyleScopes(
	ast: AnyNode,
	filename: string,
	moduleId: string,
): StyleScopeCollection {
	const styleScopes: PublicRenderStyleScope[] = [];
	const diagnostics: CompilerDiagnostic[] = [];
	const covered = new Set<AnyNode>();
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (!component) continue;
		const root = componentMarkupRoot(component.node);
		if (!root) continue;
		const own = findStyleNodes(root).filter((styleNode) => !covered.has(styleNode));
		for (const styleNode of own) covered.add(styleNode);
		const compiled = compileStyleNodes(own, filename, moduleId);
		styleScopes.push(...compiled.styleScopes);
		diagnostics.push(...compiled.diagnostics);
		if (compiled.keyframes.size > 0)
			diagnostics.push(...inlineKeyframeDiagnostics(root, compiled.keyframes, filename));
	}
	const strayDiagnostics = findStyleNodes(ast)
		.filter((styleNode) => !covered.has(styleNode))
		.map((styleNode) =>
			unsupportedRenderConstructDiagnostic({
				label: '<style>',
				message:
					'This <style> block sits outside any component markup this module renders, so its rules would never reach the page.',
				node: styleNode,
				filename,
				suggestion:
					'Move the block inside the markup a component returns, or into an imported stylesheet.',
			}),
		);
	return { styleScopes, diagnostics: [...diagnostics, ...strayDiagnostics] };
}

const STYLESHEET_REQUEST = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/;

// A stylesheet imported for its effect ships with the module, ahead of the module's own blocks.
export function collectStylesheetImports(ast: AnyNode): ReadonlyArray<string> {
	return asNodes(ast.body).flatMap((statement) => {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') return [];
		if (asNodes(statement.specifiers).length > 0) return [];
		const request = (statement.source as AnyNode | undefined)?.value;
		return typeof request === 'string' && STYLESHEET_REQUEST.test(request) ? [request] : [];
	});
}

// One compile asks for the same subtrees' style blocks from the semantic graph, the markup collector and the
// render plan; walking each tree once per ask was the pass's whole cost on a docs site.
const styleNodesByRoot = new WeakMap<AnyNode, ReadonlyArray<AnyNode>>();

function findStyleNodes(root: AnyNode): ReadonlyArray<AnyNode> {
	const cached = styleNodesByRoot.get(root);
	if (cached) return cached;
	const styleNodes: AnyNode[] = [];
	const visit = (node: AnyNode): void => {
		if (node.type === 'JSXStyleElement') {
			styleNodes.push(node);
			return;
		}
		const known = node === root ? undefined : styleNodesByRoot.get(node);
		if (known) {
			for (const styleNode of known) styleNodes.push(styleNode);
			return;
		}
		for (const value of Object.values(node)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					if (
						item &&
						typeof item === 'object' &&
						typeof (item as AnyNode).type === 'string'
					) {
						visit(item as AnyNode);
					}
				}
			} else if (
				value &&
				typeof value === 'object' &&
				typeof (value as AnyNode).type === 'string'
			) {
				visit(value as AnyNode);
			}
		}
	};
	visit(root);
	styleNodesByRoot.set(root, styleNodes);
	return styleNodes;
}

function compileStyleNodes(
	styleNodes: ReadonlyArray<AnyNode>,
	filename: string,
	moduleId: string,
): CompiledStyles {
	const scopeId = styleScopeId(moduleId, styleNodes);
	if (scopeId === null) return { styleScopes: [], diagnostics: [], keyframes: new Set() };
	const diagnostics: CompilerDiagnostic[] = [];
	const cssParts: string[] = [];
	const keyframes = new Set<string>();

	for (const styleNode of styleNodes) {
		const scoped = scopedStyleElement(styleNode, scopeId);
		if (scoped === null) {
			diagnostics.push(
				unsupportedRenderConstructDiagnostic({
					label: '<style>',
					message:
						'This <style> block could not be scope-compiled (its selectors did not parse), so it is dropped from the build.',
					node: styleNode,
					filename,
					suggestion:
						'Simplify the selectors, or move the CSS into an imported stylesheet.',
				}),
			);
			continue;
		}
		cssParts.push(scoped.cssText.trim());
		for (const name of scoped.keyframes) keyframes.add(name);
	}

	return {
		styleScopes: cssParts.length > 0 ? [{ scopeId, cssText: cssParts.join('\n') }] : [],
		diagnostics,
		keyframes,
	};
}

type ScopedSheet = { readonly cssText: string; readonly keyframes: ReadonlySet<string> };

const scopedByStyleNode = new WeakMap<AnyNode, Map<string, ScopedSheet | null>>();

function scopedStyleElement(styleNode: AnyNode, scopeId: string): ScopedSheet | null {
	let byScope = scopedByStyleNode.get(styleNode);
	if (!byScope) scopedByStyleNode.set(styleNode, (byScope = new Map()));
	if (byScope.has(scopeId)) return byScope.get(scopeId)!;
	const scoped = scopeStyleElement(styleNode, scopeId);
	byScope.set(scopeId, scoped);
	return scoped;
}

// Until @tsrx/yuku returns each `<style>` with its parsed sheet, the sheet is parsed here, once per block.
function scopeStyleElement(styleNode: AnyNode, scopeId: string): ScopedSheet | null {
	const css = rawElementText(styleNode);
	if (css === null) return null;
	const { ast, diagnostics } = parseCss(css, { parseValue: false, parseAtrulePrelude: false });
	if (diagnostics.length > 0) return null;
	const offsets: number[] = [];
	if (!collectScopeInserts(css, ast.children, offsets)) return null;
	const scopeClass = `.${scopeId}`;
	const edits: CssEdit[] = offsets.map((at) => ({ start: at, end: at, text: scopeClass }));
	const keyframes = new Set<string>();
	edits.push(...keyframeNameEdits(css, ast.children, scopeId, keyframes));
	return { cssText: spliceEdits(css, edits), keyframes };
}

type CssNode = { readonly type: string; readonly start: number; readonly end: number };
type CssParent = CssNode & { readonly children?: readonly CssNode[] | null };
type CssRule = CssNode & { readonly prelude: CssParent; readonly block: CssParent | null };
type CssAtrule = CssNode & {
	readonly name: string;
	readonly prelude: CssNode | null;
	readonly block: CssParent | null;
};
type CssDeclaration = CssNode & { readonly property: string; readonly value: CssNode };
type CssName = CssNode & { readonly name?: string; readonly value?: string };
type CssEdit = { readonly start: number; readonly end: number; readonly text: string };

// Every rule's selectors gain the class, nested rules and those under conditional at-rules included.
// A block the end of the sheet closes would swallow the next module's rules once sheets are joined, so it fails closed.
function collectScopeInserts(
	css: string,
	nodes: readonly CssNode[] | null | undefined,
	offsets: number[],
): boolean {
	for (const node of nodes ?? []) {
		if (node.type === 'Rule') {
			const rule = node as CssRule;
			if (rule.prelude.type !== 'SelectorList' || !closed(css, rule.block)) return false;
			for (const selector of rule.prelude.children ?? []) {
				const insert = selectorScopeInsert(selector as CssParent);
				if (insert === null) return false;
				offsets.push(insert);
			}
			if (!collectScopeInserts(css, rule.block?.children, offsets)) return false;
			continue;
		}
		if (node.type === 'Atrule') {
			const atrule = node as CssAtrule;
			if (atrule.block && !closed(css, atrule.block)) return false;
			// Keyframe selectors ("from", "50%") name timeline stops, not elements.
			if (unprefixed(atrule.name) === 'keyframes') continue;
			if (!collectScopeInserts(css, atrule.block?.children, offsets)) return false;
		}
	}
	return true;
}

function closed(css: string, block: CssNode | null): boolean {
	return block !== null && css[block.end - 1] === '}';
}

// The subject is the compound after the last combinator; the class goes before its first pseudo, else after it.
function selectorScopeInsert(selector: CssParent): number | null {
	const parts = selector.children ?? [];
	if (parts.length === 0) return null;
	let compound = 0;
	for (let index = 0; index < parts.length; index += 1) {
		if (parts[index]!.type === 'Combinator') compound = index + 1;
	}
	for (let index = compound; index < parts.length; index += 1) {
		const type = parts[index]!.type;
		if (type === 'PseudoClassSelector' || type === 'PseudoElementSelector')
			return parts[index]!.start;
	}
	return parts[parts.length - 1]!.end;
}

// Keyframe names are document-global, so local ones take the scope hash (TSRX spec 4.5); `-global-` and `:global { }` opt out.
function keyframeNameEdits(
	css: string,
	nodes: readonly CssNode[] | null | undefined,
	scopeId: string,
	local: Set<string>,
): CssEdit[] {
	const edits: CssEdit[] = [];
	const declare = (list: readonly CssNode[] | null | undefined, global: boolean): void => {
		for (const node of list ?? []) {
			if (node.type === 'Rule') {
				const rule = node as CssRule;
				declare(rule.block?.children, global || isGlobalBlockRule(rule));
			} else if (node.type === 'Atrule') {
				const atrule = node as CssAtrule;
				if (unprefixed(atrule.name) !== 'keyframes') {
					declare(atrule.block?.children, global);
					continue;
				}
				const name = keyframesPreludeName(css, atrule.prelude);
				if (!name || global) continue;
				const text = css.slice(name.start, name.end);
				const quoted = name.type === 'String';
				if ((quoted ? text.slice(1) : text).startsWith(GLOBAL_KEYFRAMES_PREFIX)) {
					const start = name.start + (quoted ? 1 : 0);
					edits.push({ start, end: start + GLOBAL_KEYFRAMES_PREFIX.length, text: '' });
					continue;
				}
				local.add(cssNameOf(name));
				edits.push(scopedNameEdit(name, scopeId));
			}
		}
	};
	declare(nodes, false);
	if (local.size === 0) return edits;
	const reference = (list: readonly CssNode[] | null | undefined): void => {
		for (const node of list ?? []) {
			if (node.type === 'Rule') reference((node as CssRule).block?.children);
			else if (node.type === 'Atrule') {
				const atrule = node as CssAtrule;
				if (unprefixed(atrule.name) !== 'keyframes') reference(atrule.block?.children);
			} else if (node.type === 'Declaration') {
				const declaration = node as CssDeclaration;
				const value = declaration.value;
				for (const name of animationNamesOf(declaration.property, css.slice(value.start, value.end), value.start)) {
					if (local.has(cssNameOf(name))) edits.push(scopedNameEdit(name, scopeId));
				}
			}
		}
	};
	reference(nodes);
	return edits;
}

const GLOBAL_KEYFRAMES_PREFIX = '-global-';

// Style attributes are not renamed with the block, so naming a scoped keyframe there would silently not animate.
function inlineKeyframeDiagnostics(
	root: AnyNode,
	keyframes: ReadonlySet<string>,
	filename: string,
): CompilerDiagnostic[] {
	const diagnostics: CompilerDiagnostic[] = [];
	const report = (node: AnyNode, message: string): void => {
		diagnostics.push(
			unsupportedRenderConstructDiagnostic({
				label: 'An animation in a style attribute',
				message,
				node,
				filename,
				severity: 'warning',
				suggestion: `Set the animation from a rule in the component's <style> block, or declare the keyframes as \`@keyframes ${GLOBAL_KEYFRAMES_PREFIX}name\` to keep the name global.`,
			}),
		);
	};
	const scopedNamesIn = (property: string, value: string): string[] =>
		animationNamesOf(property, value, 0)
			.map(cssNameOf)
			.filter((name) => keyframes.has(name));
	const checkCssText = (node: AnyNode, cssText: string): void => {
		const { ast } = parseCss(cssText, { context: 'declarationList' });
		for (const declaration of ((ast as CssParent).children ?? []) as CssDeclaration[]) {
			if (declaration.type !== 'Declaration') continue;
			const value = cssText.slice(declaration.value.start, declaration.value.end);
			for (const name of scopedNamesIn(declaration.property, value))
				report(node, scopedInlineMessage(name));
		}
	};
	for (const attribute of styleAttributes(root)) {
		const value = attribute.value as AnyNode | null | undefined;
		const expression =
			value?.type === 'JSXExpressionContainer' ? (value.expression as AnyNode) : value;
		const text = staticString(expression);
		if (text !== null) {
			checkCssText(attribute, text);
			continue;
		}
		if (expression?.type !== 'ObjectExpression') continue;
		for (const property of asNodes(expression.properties)) {
			const key = property.type === 'Property' ? styleObjectKey(property) : null;
			if (key === null) continue;
			const cssName = hyphenateStyleName(key);
			if (unprefixed(cssName) !== 'animation' && unprefixed(cssName) !== 'animation-name')
				continue;
			const literal = staticString(property.value as AnyNode);
			if (literal === null) {
				report(
					property,
					`The component declares scoped keyframes (${[...keyframes].join(', ')}), and this \`${key}\` value is only known at run time, so the compiler cannot point it at their scoped names.`,
				);
				continue;
			}
			for (const name of scopedNamesIn(cssName, literal))
				report(property, scopedInlineMessage(name));
		}
	}
	return diagnostics;
}

function scopedInlineMessage(name: string): string {
	return `\`${name}\` is a keyframe name scoped to this component's <style> block, so a style attribute that names it finds no keyframes.`;
}

function styleAttributes(root: AnyNode): AnyNode[] {
	const found: AnyNode[] = [];
	const visit = (node: AnyNode): void => {
		if (node.type === 'JSXStyleElement') return;
		if (node.type === 'JSXAttribute' && getIdentifierName(node.name as AnyNode) === 'style')
			found.push(node);
		for (const value of Object.values(node)) {
			for (const item of Array.isArray(value) ? value : [value]) {
				if (item && typeof item === 'object' && typeof (item as AnyNode).type === 'string')
					visit(item as AnyNode);
			}
		}
	};
	visit(root);
	return found;
}

function staticString(node: AnyNode | null | undefined): string | null {
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node?.type !== 'TemplateLiteral' || asNodes(node.expressions).length > 0) return null;
	const cooked = (asNodes(node.quasis)[0]?.value as { cooked?: string } | undefined)?.cooked;
	return typeof cooked === 'string' ? cooked : null;
}

function styleObjectKey(property: AnyNode): string | null {
	if (property.computed) return null;
	const key = property.key as AnyNode | undefined;
	if (key?.type === 'Identifier') return key.name as string;
	return staticString(key);
}

function isGlobalBlockRule(rule: CssRule): boolean {
	const selectors = rule.prelude.type === 'SelectorList' ? (rule.prelude.children ?? []) : [];
	const parts = (selectors.length === 1 ? (selectors[0] as CssParent).children : null) ?? [];
	const only = parts.length === 1 ? (parts[0] as CssParent & CssName) : null;
	return only?.type === 'PseudoClassSelector' && only.name === 'global' && !only.children;
}

function keyframesPreludeName(css: string, prelude: CssNode | null): CssName | null {
	if (!prelude) return null;
	const { ast } = parseCss(css.slice(prelude.start, prelude.end), {
		context: 'atrulePrelude',
		atrule: 'keyframes',
	});
	const parts = (ast as CssParent).children ?? [];
	const only = parts.length === 1 ? parts[0]! : null;
	if (only?.type !== 'Identifier' && only?.type !== 'String') return null;
	return shifted(only as CssName, prelude.start);
}

// Shorthand values that another `animation-*` longhand claims first (CSS Animations 1, `animation`).
const ANIMATION_KEYWORD_GROUPS = new Map<string, string>([
	...['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'].map(
		(word) => [word, 'timing'] as const,
	),
	['infinite', 'iteration'],
	...['normal', 'reverse', 'alternate', 'alternate-reverse'].map(
		(word) => [word, 'direction'] as const,
	),
	...['none', 'forwards', 'backwards', 'both'].map((word) => [word, 'fill'] as const),
	...['running', 'paused'].map((word) => [word, 'play-state'] as const),
]);

function animationNamesOf(propertyName: string, value: string, offset: number): CssName[] {
	const property = unprefixed(propertyName);
	if (property !== 'animation' && property !== 'animation-name') return [];
	const { ast } = parseCss(value, { context: 'value' });
	const names: CssName[] = [];
	let claimed = new Set<string>();
	for (const part of ((ast as CssParent).children ?? []) as CssName[]) {
		if (part.type === 'Operator' && part.value === ',') {
			claimed = new Set();
			continue;
		}
		if (part.type === 'Identifier' && property === 'animation') {
			const group = ANIMATION_KEYWORD_GROUPS.get(part.name!.toLowerCase());
			if (group && !claimed.has(group)) {
				claimed.add(group);
				continue;
			}
		}
		if (part.type === 'Identifier' || part.type === 'String')
			names.push(shifted(part, offset));
	}
	return names;
}

function cssNameOf(name: CssName): string {
	return (name.type === 'String' ? name.value : name.name) ?? '';
}

function scopedNameEdit(name: CssName, scopeId: string): CssEdit {
	const at = name.type === 'String' ? name.end - 1 : name.end;
	return { start: at, end: at, text: `-${scopeId}` };
}

function shifted(node: CssName, by: number): CssName {
	return { ...node, start: node.start + by, end: node.end + by };
}

// `-webkit-keyframes` is `keyframes`, `-moz-animation-name` is `animation-name`; custom properties stay as written.
function unprefixed(name: string): string {
	const lower = name.toLowerCase();
	if (!lower.startsWith('-') || lower.startsWith('--')) return lower;
	const vendorEnd = lower.indexOf('-', 1);
	return vendorEnd === -1 ? lower : lower.slice(vendorEnd + 1);
}

function spliceEdits(source: string, edits: readonly CssEdit[]): string {
	if (edits.length === 0) return source;
	const ascending = [...edits].sort((left, right) => left.start - right.start);
	let output = '';
	let from = 0;
	for (const edit of ascending) {
		output += source.slice(from, edit.start) + edit.text;
		from = edit.end;
	}
	return output + source.slice(from);
}

// Document metadata is never rendered, so no scoped selector can style it.
const UNSTYLED_DOCUMENT_TAGS = new Set([
	'head',
	'title',
	'meta',
	'link',
	'base',
	'script',
	'style',
]);

export function takesStyleScopeClass(tagName: string): boolean {
	return !UNSTYLED_DOCUMENT_TAGS.has(tagName.toLowerCase());
}

// FNV-1a over the module id and the offset of the first block with a body; null when every block is self-closing.
function styleScopeId(moduleId: string, styleNodes: ReadonlyArray<AnyNode>): string | null {
	const first = styleNodes.find((styleNode) => styleNode.closingElement);
	if (!first) return null;
	const key = `${moduleId}:${first.start as number}`;
	let hash = 0x811c9dc5;
	for (let index = 0; index < key.length; index++) {
		hash ^= key.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `mk-${hash.toString(36)}`;
}
