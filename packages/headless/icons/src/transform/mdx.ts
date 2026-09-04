import MagicString from 'magic-string';
import type { CollectionLoader } from '../collection-loader.ts';
import type { ResolvedIconsOptions } from '../options.ts';
import {
	cleanImports,
	renderSvg,
	within,
	type AttributeSpan,
	type ImportDeclarationSpan,
	type Range,
} from './shared.ts';

export async function transformMdx(
	source: string,
	file: string,
	options: ResolvedIconsOptions,
	loader: CollectionLoader,
	diagnostic?: (message: string) => void,
): Promise<string | undefined> {
	// Fenced blocks and backtick spans are documentation, not code: no import, tag or
	// reference inside one belongs to the module.
	const fenced = fencedRanges(source);
	const code = [...fenced, ...inlineCodeRanges(source, fenced)];
	const { bindings, imports } = mdxImports(source, options.importSources, code);
	if (bindings.size === 0) return undefined;
	const tags = scanTags(source, code);
	const magic = new MagicString(source);
	const usedLocals = new Set<string>();
	const replaced: Array<Range & { tag: string }> = [];
	for (const tag of tags) {
		const parts = tag.name.split('.');
		if (parts.length !== 2 || !bindings.has(parts[0]!)) continue;
		const local = parts[0]!;
		const pack = bindings.get(local)!;
		const prefix = options.packs.get(pack);
		// A namespace from a shared source that is not a pack is a component family; leave it.
		if (!prefix) continue;
		const outer = replaced.find((range) => within(tag.start, [range]));
		if (outer) {
			throw new Error(
				`@markless/icons: ${file}: <${tag.name}> sits inside <${outer.tag}>; an icon tag cannot contain another icon tag`,
			);
		}
		const icon = await loader.icon(prefix, parts[1]!, file, pack, diagnostic);
		magic.overwrite(
			tag.start,
			tag.end,
			renderSvg({
				source,
				attributes: tag.attributes,
				attributeStart: tag.nameEnd,
				attributeEnd: tag.openEnd - (tag.selfClosing ? 2 : 1),
				children: tag.children,
				icon,
			}),
		);
		replaced.push({ start: tag.start, end: tag.end, tag: tag.name });
		usedLocals.add(local);
	}
	if (usedLocals.size === 0) return undefined;
	const rewritten = [...imports, ...replaced, ...code];
	cleanImports(
		source,
		imports,
		(specifier) =>
			usedLocals.has(specifier.local) && !referencedOutside(source, specifier.local, rewritten),
		magic,
	);
	return magic.toString();
}

function referencedOutside(source: string, local: string, rewritten: readonly Range[]): boolean {
	for (const match of source.matchAll(new RegExp(`\\b${local}\\b`, 'g'))) {
		if (!within(match.index, rewritten)) return true;
	}
	return false;
}

function mdxImports(source: string, allowed: Set<string>, excluded: readonly Range[]) {
	const bindings = new Map<string, string>();
	const imports: ImportDeclarationSpan[] = [];
	const pattern = /^import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2\s*;?/gm;
	for (const match of source.matchAll(pattern)) {
		if (!allowed.has(match[3]!)) continue;
		const declarationStart = match.index;
		if (within(declarationStart, excluded)) continue;
		const bodyStart = declarationStart + match[0].indexOf('{') + 1;
		const specifiers = [...match[1]!.matchAll(/([A-Za-z_$][\w$]*)(\s+as\s+([A-Za-z_$][\w$]*))?/g)].map(
			(part) => {
				const start = bodyStart + part.index;
				const local = part[3] ?? part[1]!;
				bindings.set(local, part[1]!);
				return { start, end: start + part[0].length, local, removable: true };
			},
		);
		imports.push({ start: declarationStart, end: declarationStart + match[0].length, specifiers });
	}
	return { bindings, imports };
}

function fencedRanges(source: string): Range[] {
	const ranges: Range[] = [];
	const pattern = /^(\s*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2\s*$/gm;
	for (const match of source.matchAll(pattern)) {
		ranges.push({ start: match.index, end: match.index + match[0].length });
	}
	return ranges;
}

/** Backtick spans outside fenced blocks: `<lucide.check />` in prose is a sample, not a tag. */
function inlineCodeRanges(source: string, fenced: readonly Range[]): Range[] {
	const ranges: Range[] = [];
	const pattern = /`+/g;
	let open: { start: number; length: number } | undefined;
	for (const match of source.matchAll(pattern)) {
		if (within(match.index, fenced)) continue;
		const length = match[0].length;
		if (!open) {
			open = { start: match.index, length };
			continue;
		}
		if (open.length !== length) continue;
		ranges.push({ start: open.start, end: match.index + length });
		open = undefined;
	}
	return ranges;
}

interface ScannedTag {
	start: number;
	end: number;
	openEnd: number;
	name: string;
	nameEnd: number;
	selfClosing: boolean;
	attributes: AttributeSpan[];
	children: string;
}

function scanTags(source: string, excluded: readonly Range[]): ScannedTag[] {
	const tags: ScannedTag[] = [];
	const pattern = /<([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)/g;
	for (const match of source.matchAll(pattern)) {
		const start = match.index;
		if (within(start, excluded)) continue;
		const name = match[1]!;
		const nameEnd = start + 1 + name.length;
		const openEnd = tagEnd(source, nameEnd);
		if (openEnd < 0) continue;
		const selfClosing = /\/\s*>$/.test(source.slice(nameEnd, openEnd));
		let end = openEnd;
		let children = '';
		if (!selfClosing) {
			const closing = `</${name}>`;
			const closeStart = source.indexOf(closing, openEnd);
			if (closeStart < 0) continue;
			children = source.slice(openEnd, closeStart);
			end = closeStart + closing.length;
		}
		tags.push({ start, end, openEnd, name, nameEnd, selfClosing, attributes: scanAttributes(source, nameEnd, openEnd), children });
	}
	return tags;
}

function tagEnd(source: string, start: number): number {
	let quote = '';
	let braces = 0;
	for (let index = start; index < source.length; index += 1) {
		const char = source[index]!;
		if (quote) {
			if (char === quote && source[index - 1] !== '\\') quote = '';
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === '{') braces += 1;
		else if (char === '}') braces -= 1;
		else if (char === '>' && braces === 0) return index + 1;
	}
	return -1;
}

function scanAttributes(source: string, start: number, end: number): AttributeSpan[] {
	const attributes: AttributeSpan[] = [];
	const text = source.slice(start, end - 1).replace(/\/\s*$/, ' ');
	const pattern = /(?:^|\s)(\.\.\.[^}\s]+|([:\w-]+)(?:\s*=\s*("[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\}))?)/g;
	for (const match of text.matchAll(pattern)) {
		const raw = match[1]!;
		const absoluteStart = start + match.index + match[0].indexOf(raw);
		const equal = raw.indexOf('=');
		attributes.push({
			...(match[2] ? { name: match[2] } : {}),
			start: absoluteStart,
			end: absoluteStart + raw.length,
			...(equal >= 0 ? { valueStart: absoluteStart + equal + 1, valueEnd: absoluteStart + raw.length } : {}),
		});
	}
	return attributes;
}
