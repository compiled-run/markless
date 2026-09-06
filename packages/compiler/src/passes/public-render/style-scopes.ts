import { asNodes, type AnyNode } from '../../ast/nodes.ts';
import { getComponentFunction } from '../../ast/tsrx.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';
import { componentMarkupRoot } from './component-markup-root.ts';
import { unsupportedRenderConstructDiagnostic } from './diagnostics.ts';

// Scoped <style> blocks per the accepted Option A draft in
// specs/framework/08-deferred-decisions.md: one build-hashed scope class per
// component; every selector's subject compound gains the class; host elements
// gain the class in emitted HTML; the compiled CSS ships through the bundler.
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

// The module, not the selected render root, owns the shipped CSS: every
// component mints the module's scope class onto its own elements, so a block
// left behind here paints nothing while its class is still stamped in the HTML.
export function collectModuleStyleScopes(
	ast: AnyNode,
	filename: string,
	moduleId: string,
): StyleScopeCollection {
	const shipped: AnyNode[] = [];
	const covered = new Set<AnyNode>();
	for (const statement of asNodes(ast.body)) {
		const component = getComponentFunction(statement);
		if (!component) continue;
		const root = componentMarkupRoot(component.node);
		if (!root) continue;
		for (const styleNode of findStyleNodes(root)) {
			if (covered.has(styleNode)) continue;
			covered.add(styleNode);
			shipped.push(styleNode);
		}
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
	const compiled = compileStyleNodes(shipped, filename, moduleId);
	return {
		styleScopes: compiled.styleScopes,
		diagnostics: [...compiled.diagnostics, ...strayDiagnostics],
	};
}

function findStyleNodes(root: AnyNode): AnyNode[] {
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
	return styleNodes;
}

function compileStyleNodes(
	styleNodes: ReadonlyArray<AnyNode>,
	filename: string,
	moduleId: string,
): StyleScopeCollection {
	if (styleNodes.length === 0) return { styleScopes: [], diagnostics: [] };

	const scopeId = styleScopeId(moduleId);
	const diagnostics: CompilerDiagnostic[] = [];
	const cssParts: string[] = [];

	for (const styleNode of styleNodes) {
		const css = typeof styleNode.css === 'string' ? styleNode.css : null;
		const scoped = css === null ? null : scopeSelectors(styleNode, scopeId);
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

// Inserts `.mk-<hash>` in the rightmost subject compound before pseudos. The
// parser's CSS structure scanner already located those positions, one
// `CssSelector.scopeInsert` each, so this splices them into the author's own
// bytes instead of reparsing and reserializing the sheet. A sheet the scanner
// could not model reports `scanned: false`, and the caller turns that into the
// fail-closed diagnostic.
function scopeSelectors(styleNode: AnyNode, scopeId: string): string | null {
	const scoped: string[] = [];
	for (const sheet of asNodes(styleNode.children)) {
		if (sheet.type !== 'StyleSheet') continue;
		if (sheet.scanned !== true || typeof sheet.source !== 'string') return null;
		const offsets: number[] = [];
		collectScopeInserts(asNodes(sheet.children), offsets);
		scoped.push(spliceScopeClass(sheet.source, offsets, `.${scopeId}`));
	}
	// No sheet at all (a self-closing `<style/>`) is empty CSS, not a bail-out.
	return scoped.join('');
}

function collectScopeInserts(nodes: readonly AnyNode[], offsets: number[]): void {
	for (const node of nodes) {
		if (node.type === 'CssRule') {
			for (const selector of asNodes(node.prelude)) {
				if (typeof selector.scopeInsert === 'number') offsets.push(selector.scopeInsert);
			}
			collectScopeInserts(asNodes(node.block), offsets);
			continue;
		}
		// Keyframe selectors ("from", "50%") name timeline stops, not elements.
		if (node.type === 'CssAtrule' && node.keyframes !== true) {
			collectScopeInserts(asNodes(node.block), offsets);
		}
	}
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

// `scopeInsert` counts UTF-8 bytes into the sheet source, so the splice runs on
// bytes: a string index would drift once any earlier byte is non-ASCII.
function spliceScopeClass(source: string, offsets: readonly number[], scopeClass: string): string {
	if (offsets.length === 0) return source;
	const insert = utf8Encoder.encode(scopeClass);
	let bytes = utf8Encoder.encode(source);
	for (const offset of [...offsets].sort((left, right) => right - left)) {
		const at = Math.min(Math.max(offset, 0), bytes.length);
		const spliced = new Uint8Array(bytes.length + insert.length);
		spliced.set(bytes.subarray(0, at), 0);
		spliced.set(insert, at);
		spliced.set(bytes.subarray(at), at + insert.length);
		bytes = spliced;
	}
	return utf8Decoder.decode(bytes);
}

// FNV-1a over the module id: stable per component module, runtime-agnostic.
function styleScopeId(moduleId: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < moduleId.length; index++) {
		hash ^= moduleId.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `mk-${hash.toString(36)}`;
}
