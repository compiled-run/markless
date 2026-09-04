import MagicString from 'magic-string';
import type { ResolvedIcon } from '../collection-loader.ts';

export interface AttributeSpan {
	name?: string;
	start: number;
	end: number;
	valueStart?: number;
	valueEnd?: number;
}

export function renderSvg(input: {
	source: string;
	attributes: AttributeSpan[];
	attributeStart: number;
	attributeEnd: number;
	children: string;
	icon: ResolvedIcon;
}): string {
	const removed = new Set(['title', 'description']);
	const attributes = new MagicString(input.source.slice(input.attributeStart, input.attributeEnd));
	for (const attribute of input.attributes) {
		if (attribute.name && removed.has(attribute.name)) {
			attributes.remove(attribute.start - input.attributeStart, attribute.end - input.attributeStart);
		}
	}
	const names = new Set(input.attributes.map((attribute) => attribute.name).filter(Boolean));
	let renderedAttributes = attributes.toString().trimEnd();
	if (renderedAttributes && !/^\s/.test(renderedAttributes)) renderedAttributes = ` ${renderedAttributes}`;
	if (!names.has('width')) renderedAttributes += ' width="1em"';
	if (!names.has('height')) renderedAttributes += ' height="1em"';
	if (!names.has('viewBox')) renderedAttributes += ` viewBox="${input.icon.attributes.viewBox}"`;
	if (!names.has('preserveAspectRatio')) renderedAttributes += ' preserveAspectRatio="xMidYMid meet"';
	const title = childFor('title', input.attributes, input.source);
	const description = childFor('description', input.attributes, input.source);
	return `<svg${renderedAttributes}>${title}${description}${input.icon.body}${input.children}</svg>`;
}

function childFor(name: string, attributes: AttributeSpan[], source: string): string {
	const attribute = attributes.find((item) => item.name === name);
	if (!attribute) return '';
	if (attribute.valueStart === undefined || attribute.valueEnd === undefined) return `<${name}></${name}>`;
	const raw = source.slice(attribute.valueStart, attribute.valueEnd);
	const childName = name === 'description' ? 'desc' : name;
	const value = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
	return `<${childName}>${value}</${childName}>`;
}

export function cleanImports(
	source: string,
	imports: Array<{ start: number; end: number; specifiers: Array<{ start: number; end: number; local: string }> }>,
	usedLocals: Set<string>,
	magic: MagicString,
): void {
	for (const declaration of imports) {
		const removed = declaration.specifiers.filter((specifier) => usedLocals.has(specifier.local));
		if (removed.length === 0) continue;
		const kept = declaration.specifiers.filter((specifier) => !usedLocals.has(specifier.local));
		if (kept.length === 0) {
			magic.remove(declaration.start, declaration.end);
			continue;
		}
		magic.overwrite(
			declaration.specifiers[0]!.start,
			declaration.specifiers.at(-1)!.end,
			kept.map((specifier) => source.slice(specifier.start, specifier.end)).join(', '),
		);
	}
}
