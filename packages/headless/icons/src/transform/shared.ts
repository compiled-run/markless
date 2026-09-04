import MagicString from 'magic-string';
import type { ResolvedIcon } from '../collection-loader.ts';

export interface AttributeSpan {
	name?: string;
	start: number;
	end: number;
	valueStart?: number;
	valueEnd?: number;
}

export interface ImportSpecifierSpan {
	start: number;
	end: number;
	local: string;
	/** Only a named specifier can be dropped; a default or namespace binding stays. */
	removable: boolean;
}

export interface ImportDeclarationSpan {
	start: number;
	end: number;
	specifiers: ImportSpecifierSpan[];
}

export interface Range {
	start: number;
	end: number;
}

export function within(offset: number, ranges: readonly Range[]): boolean {
	return ranges.some((range) => offset >= range.start && offset < range.end);
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
	if (title || description) {
		if (!names.has('role')) renderedAttributes += ' role="img"';
	} else if (!names.has('aria-hidden')) {
		renderedAttributes += ' aria-hidden="true"';
	}
	return `<svg${renderedAttributes}>${title}${description}${input.icon.body}${input.children}</svg>`;
}

function childFor(name: string, attributes: AttributeSpan[], source: string): string {
	const attribute = attributes.find((item) => item.name === name);
	if (!attribute) return '';
	const childName = name === 'description' ? 'desc' : name;
	if (attribute.valueStart === undefined || attribute.valueEnd === undefined) {
		return `<${childName}></${childName}>`;
	}
	const raw = source.slice(attribute.valueStart, attribute.valueEnd);
	// A quoted value is text, not markup: re-emit it as a string expression so `<`, `&` and `{` survive.
	const value =
		raw.startsWith('"') || raw.startsWith("'")
			? `{${JSON.stringify(raw.slice(1, -1))}}`
			: raw;
	return `<${childName}>${value}</${childName}>`;
}

export function cleanImports(
	source: string,
	imports: readonly ImportDeclarationSpan[],
	dropped: (specifier: ImportSpecifierSpan) => boolean,
	magic: MagicString,
): void {
	for (const declaration of imports) {
		const removable = declaration.specifiers.filter(
			(specifier) => specifier.removable && dropped(specifier),
		);
		if (removable.length === 0) continue;
		const kept = declaration.specifiers.filter((specifier) => !removable.includes(specifier));
		if (kept.length === 0) {
			magic.remove(declaration.start, declaration.end);
			continue;
		}
		const declarationText = source.slice(declaration.start, declaration.end);
		const braceStart = declaration.start + declarationText.indexOf('{');
		const braceEnd = declaration.start + declarationText.indexOf('}');
		const keptNames = kept
			.filter((specifier) => specifier.start > braceStart && specifier.end <= braceEnd)
			.map((specifier) => source.slice(specifier.start, specifier.end));
		if (keptNames.length === 0) {
			// Only a default or namespace binding survives; the whole named group goes with its comma.
			const comma = source.lastIndexOf(',', braceStart);
			magic.remove(comma > declaration.start ? comma : braceStart, braceEnd + 1);
			continue;
		}
		magic.overwrite(braceStart + 1, braceEnd, ` ${keptNames.join(', ')} `);
	}
}
