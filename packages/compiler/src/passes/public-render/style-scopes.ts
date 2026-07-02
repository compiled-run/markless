import type { AnyNode } from '../../ast/nodes.ts';
import { asNodes } from '../../ast/nodes.ts';
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
		const scoped = css === null ? null : scopeSelectors(css, styleNode, scopeId);
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

// Splices `.mk-<hash>` after each selector's subject compound, descending
// at-rule blocks but skipping @keyframes (whose preludes are not selectors).
function scopeSelectors(css: string, styleNode: AnyNode, scopeId: string): string | null {
	const insertOffsets: number[] = [];

	const visitRules = (node: AnyNode | undefined, insideKeyframes: boolean): boolean => {
		if (!node || typeof node !== 'object') return true;
		if (node.type === 'Rule' && !insideKeyframes) {
			const selectors = asNodes((node.prelude as AnyNode | undefined)?.children);
			if (selectors.length === 0) return false;
			for (const selector of selectors) {
				if (typeof selector.end !== 'number') return false;
				insertOffsets.push(selector.end as number);
			}
			return true;
		}
		const keyframes =
			insideKeyframes ||
			(node.type === 'Atrule' && String(node.name ?? '').includes('keyframes'));
		for (const child of asNodes(
			(node.block as AnyNode | undefined)?.children ?? node.children,
		)) {
			if (!visitRules(child, keyframes)) return false;
		}
		return true;
	};

	for (const sheet of asNodes(styleNode.children)) {
		if (!visitRules(sheet, false)) return null;
	}

	let scoped = css;
	for (const offset of [...insertOffsets].sort((left, right) => right - left)) {
		scoped = `${scoped.slice(0, offset)}.${scopeId}${scoped.slice(offset)}`;
	}
	return scoped;
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
