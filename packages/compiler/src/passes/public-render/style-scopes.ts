import { parse as parseCss } from 'yuku-css';
import { asNodes, type AnyNode } from '../../ast/nodes.ts';
import { rawElementText } from '../../ast/raw-text.ts';
import { getComponentFunction } from '../../ast/tsrx.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';
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
): StyleScopeCollection {
	const scopeId = styleScopeId(moduleId, styleNodes);
	if (scopeId === null) return { styleScopes: [], diagnostics: [] };
	const diagnostics: CompilerDiagnostic[] = [];
	const cssParts: string[] = [];

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
		cssParts.push(scoped.trim());
	}

	return {
		styleScopes: cssParts.length > 0 ? [{ scopeId, cssText: cssParts.join('\n') }] : [],
		diagnostics,
	};
}

const scopedByStyleNode = new WeakMap<AnyNode, Map<string, string | null>>();

function scopedStyleElement(styleNode: AnyNode, scopeId: string): string | null {
	let byScope = scopedByStyleNode.get(styleNode);
	if (!byScope) scopedByStyleNode.set(styleNode, (byScope = new Map()));
	if (byScope.has(scopeId)) return byScope.get(scopeId)!;
	const scoped = scopeStyleElement(styleNode, scopeId);
	byScope.set(scopeId, scoped);
	return scoped;
}

// Until @tsrx/yuku returns each `<style>` with its parsed sheet, the sheet is parsed here, once per block.
function scopeStyleElement(styleNode: AnyNode, scopeId: string): string | null {
	const css = rawElementText(styleNode);
	if (css === null) return null;
	const { ast, diagnostics } = parseCss(css, { parseValue: false, parseAtrulePrelude: false });
	if (diagnostics.length > 0) return null;
	const offsets: number[] = [];
	if (!collectScopeInserts(css, ast.children, offsets)) return null;
	return spliceScopeClass(css, offsets, `.${scopeId}`);
}

type CssNode = { readonly type: string; readonly start: number; readonly end: number };
type CssParent = CssNode & { readonly children?: readonly CssNode[] | null };
type CssRule = CssNode & { readonly prelude: CssParent; readonly block: CssParent | null };
type CssAtrule = CssNode & { readonly name: string; readonly block: CssParent | null };

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
			if (/keyframes$/i.test(atrule.name)) continue;
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

function spliceScopeClass(source: string, offsets: readonly number[], scopeClass: string): string {
	if (offsets.length === 0) return source;
	const ascending = [...offsets].sort((left, right) => left - right);
	let output = '';
	let from = 0;
	for (const at of ascending) {
		output += source.slice(from, at) + scopeClass;
		from = at;
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
