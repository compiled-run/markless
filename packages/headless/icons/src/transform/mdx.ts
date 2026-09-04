import MagicString from 'magic-string';
import type { CollectionLoader } from '../collection-loader.ts';
import { nearestName } from '../naming.ts';
import type { ResolvedIconsOptions } from '../options.ts';
import { cleanImports, renderSvg, type AttributeSpan } from './shared.ts';

export async function transformMdx(
	source: string,
	file: string,
	options: ResolvedIconsOptions,
	loader: CollectionLoader,
	diagnostic?: (message: string) => void,
): Promise<string | undefined> {
	const { bindings, imports } = mdxImports(source, options.importSources);
	if (bindings.size === 0) return undefined;
	const fenced = fencedRanges(source);
	const tags = scanTags(source, fenced);
	const magic = new MagicString(source);
	const usedLocals = new Set<string>();
	for (const tag of tags) {
		const parts = tag.name.split('.');
		if (parts.length !== 2 || !bindings.has(parts[0]!)) continue;
		const local = parts[0]!;
		const pack = bindings.get(local)!;
		const prefix = options.packs.get(pack);
		if (!prefix) {
			const nearest = nearestName(pack, options.packs.keys());
			throw new Error(`@markless/icons: ${file}: unknown pack ${pack} for ${pack}.${parts[1]}${nearest ? `; nearest name is ${nearest}` : ''}`);
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
		usedLocals.add(local);
	}
	if (usedLocals.size === 0) return undefined;
	cleanImports(source, imports, usedLocals, magic);
	return magic.toString();
}

function mdxImports(source: string, allowed: Set<string>) {
	const bindings = new Map<string, string>();
	const imports: Array<{ start: number; end: number; specifiers: Array<{ start: number; end: number; local: string }> }> = [];
	const pattern = /^import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2\s*;?/gm;
	for (const match of source.matchAll(pattern)) {
		if (!allowed.has(match[3]!)) continue;
		const declarationStart = match.index;
		const bodyStart = declarationStart + match[0].indexOf('{') + 1;
		const specifiers = [...match[1]!.matchAll(/([A-Za-z_$][\w$]*)(\s+as\s+([A-Za-z_$][\w$]*))?/g)].map((part) => {
			const start = bodyStart + part.index;
			const local = part[3] ?? part[1]!;
			bindings.set(local, part[1]!);
			return { start, end: start + part[0].length, local };
		});
		imports.push({ start: declarationStart, end: declarationStart + match[0].length, specifiers });
	}
	return { bindings, imports };
}

function fencedRanges(source: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	const pattern = /^(\s*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2\s*$/gm;
	for (const match of source.matchAll(pattern)) ranges.push([match.index, match.index + match[0].length]);
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

function scanTags(source: string, excluded: Array<[number, number]>): ScannedTag[] {
	const tags: ScannedTag[] = [];
	const pattern = /<([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)/g;
	for (const match of source.matchAll(pattern)) {
		const start = match.index;
		if (excluded.some(([from, to]) => start >= from && start < to)) continue;
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
