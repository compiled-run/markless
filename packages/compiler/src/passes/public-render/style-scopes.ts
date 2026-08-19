import postcss, { type AtRule, type Container, type Document, type Rule } from 'postcss';
import selectorParser, { type Selector } from 'postcss-selector-parser';
import type { AnyNode } from '../../ast/nodes.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';
import { unsupportedRenderConstructDiagnostic } from './diagnostics.ts';

// Scoped <style> blocks per the accepted Option A draft in
// specs/framework/08-deferred-decisions.md: one build-hashed scope class per
// component; every selector's subject compound gains the class; host elements
// gain the class in emitted HTML; the compiled CSS ships through the bundler.
export type PublicRenderStyleScope = {
	readonly scopeId: string;
	readonly cssText: string;
};

export function collectStyleScopes(
	root: AnyNode,
	filename: string,
): {
	readonly styleScopes: ReadonlyArray<PublicRenderStyleScope>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
} {
	const styleNodes: AnyNode[] = [];
	const visit = (node: AnyNode): void => {
		if (node.type === 'JSXStyleElement') {
			styleNodes.push(node);
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

	if (styleNodes.length === 0) return { styleScopes: [], diagnostics: [] };

	const scopeId = styleScopeId(filename);
	const diagnostics: CompilerDiagnostic[] = [];
	const cssParts: string[] = [];

	for (const styleNode of styleNodes) {
		const css = typeof styleNode.css === 'string' ? styleNode.css : null;
		const scoped = css === null ? null : scopeSelectors(css, scopeId);
		if (scoped === null) {
			diagnostics.push(
				unsupportedRenderConstructDiagnostic({
					label: '<style>',
					message:
						'This <style> block could not be scope-compiled (selector offsets unavailable), so it is dropped from the build.',
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

// Inserts `.mk-<hash>` in the rightmost subject compound before pseudos.
// PostCSS walks ordinary nested at-rules; keyframe selectors are excluded.
function scopeSelectors(css: string, scopeId: string): string | null {
	try {
		const root = postcss.parse(css);
		root.walkRules((rule) => {
			if (isInsideKeyframes(rule)) return;
			rule.selector = selectorParser((selectors) => {
				selectors.each((selector) => insertScopeClass(selector, scopeId));
			}).processSync(rule.selector);
		});
		return root.toString();
	} catch {
		return null;
	}
}

function insertScopeClass(selector: Selector, scopeId: string): void {
	let compoundStart = 0;
	for (let index = selector.nodes.length - 1; index >= 0; index -= 1) {
		if (selector.nodes[index]?.type === 'combinator') {
			compoundStart = index + 1;
			break;
		}
	}
	const pseudoIndex = selector.nodes.findIndex(
		(node, index) => index >= compoundStart && node.type === 'pseudo',
	);
	const scopeClass = selectorParser.className({ value: scopeId });
	const insertionPoint = pseudoIndex === -1 ? undefined : selector.nodes[pseudoIndex];
	if (insertionPoint) selector.insertBefore(insertionPoint, scopeClass);
	else selector.append(scopeClass);
}

function isInsideKeyframes(rule: Rule): boolean {
	let parent: Container | Document | undefined = rule.parent;
	while (parent) {
		if (parent.type === 'atrule' && /keyframes$/i.test((parent as AtRule).name)) return true;
		parent = parent.parent;
	}
	return false;
}

// FNV-1a over the filename: stable per component module, runtime-agnostic.
function styleScopeId(filename: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < filename.length; index++) {
		hash ^= filename.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `mk-${hash.toString(36)}`;
}
