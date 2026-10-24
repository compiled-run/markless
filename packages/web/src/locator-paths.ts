import { isArmBranchAnchorComment } from './resume-anchor-census.ts';
import { PROTOCOL_LOCATOR_PATHS_DIGITS } from '../../serializer/src/protocol-locator-paths-format.ts';
import {
	PROTOCOL_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE,
	PROTOCOL_RAW_TEXT_TAGS,
	PROTOCOL_TEMPLATE_CONTENT_TAG,
} from '../../serializer/src/protocol-detached-content.ts';

// Server side of PROTOCOL_LOCATOR_PATHS_ATTRIBUTE: reads the element tree the
// browser will build from the container's html, the way its parser does.
const VOID_TAGS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'source',
	'track',
	'wbr',
]);
const FOREIGN_ROOTS = new Set(['svg', 'math']);
const DECLARATIVE_SHADOW_ROOT = new RegExp(
	`\\s${PROTOCOL_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE}(?:[\\s=/>]|$)`,
	'i',
);

type ServedElement = {
	readonly tag: string;
	readonly parent: number;
	/** Its place among the parent's element children. */
	readonly child: number;
	/** Its place among the parent's child nodes, text and comments included. */
	readonly node: number;
};

type ServedTree = {
	/** Every element the browser counts under the container, in DOM order; the container is 0. */
	readonly elements: ReadonlyArray<ServedElement>;
	readonly childCounts: ReadonlyArray<number>;
	/** Per page-level comment anchor in DOM order, the index the next element takes. */
	readonly commentElementIndexes: ReadonlyArray<number>;
	/** Per element, the html offset just past its tag name, where an attribute can be written. */
	readonly nameEnds: ReadonlyArray<number>;
};

export function servedElementTree(html: string): ServedTree {
	const elements: ServedElement[] = [{ tag: '', parent: -1, child: 0, node: 0 }];
	const childCounts = [0];
	const nodeCounts = [0];
	// Adjacent text the parser joins into one node, tracked per parent.
	const inText = [false];
	const current = () => (stack.length ? stack[stack.length - 1]!.index : 0);
	const node = (parent: number, text: boolean) => {
		if (templateDepth > 0 || (text && inText[parent])) return;
		nodeCounts[parent]!++;
		inText[parent] = text;
	};
	const commentElementIndexes: number[] = [];
	const nameEnds = [0];
	const stack: Array<{ readonly tag: string; readonly index: number }> = [];
	let templateDepth = 0;
	let foreignDepth = 0;
	let at = 0;
	let lowerHtml: string | undefined;
	while (at < html.length) {
		const open = html.indexOf('<', at);
		if (open < 0) break;
		if (open > at) node(current(), true);
		if (html.startsWith('<!--', open)) {
			node(current(), false);
			const end = html.indexOf('-->', open + 4);
			at = end < 0 ? html.length : end + 3;
			const data = html.slice(open + 4, end < 0 ? html.length : end);
			if (templateDepth === 0 && !isArmBranchAnchorComment({ nodeType: 8, data }))
				commentElementIndexes.push(elements.length);
			continue;
		}
		const next = html[open + 1] ?? '';
		if (next === '!' || next === '?') {
			node(current(), false);
			const end = html.indexOf('>', open);
			at = end < 0 ? html.length : end + 1;
			continue;
		}
		const closing = next === '/';
		const nameStart = closing ? open + 2 : open + 1;
		const nameMatch = /^[a-zA-Z][^\s/>]*/.exec(html.slice(nameStart, nameStart + 64));
		if (!nameMatch) {
			node(current(), true);
			at = open + 1;
			continue;
		}
		// The parser lowercases html tag names and keeps the authored case inside svg and math.
		const name = nameMatch[0];
		const lower = name.toLowerCase();
		const tag = foreignDepth > 0 ? name : lower;
		const tagEnd = endOfTag(html, nameStart + nameMatch[0].length);
		at = tagEnd + 1;
		if (closing) {
			const match = stack.findLastIndex((entry) => entry.tag.toLowerCase() === lower);
			if (match < 0) continue;
			for (const popped of stack.splice(match)) {
				if (popped.tag.toLowerCase() === PROTOCOL_TEMPLATE_CONTENT_TAG) templateDepth--;
				if (FOREIGN_ROOTS.has(popped.tag.toLowerCase())) foreignDepth--;
			}
			continue;
		}
		const selfClosing = foreignDepth > 0 && html[tagEnd - 1] === '/';
		const parent = stack.length ? stack[stack.length - 1]!.index : 0;
		let index = parent;
		const shadowRoot =
			lower === PROTOCOL_TEMPLATE_CONTENT_TAG &&
			DECLARATIVE_SHADOW_ROOT.test(html.slice(nameStart + name.length, tagEnd));
		if (templateDepth === 0 && !shadowRoot) {
			index =
				elements.push({
					tag,
					parent,
					child: childCounts[parent]!++,
					node: nodeCounts[parent]!,
				}) - 1;
			node(parent, false);
			childCounts.push(0);
			nodeCounts.push(0);
			inText.push(false);
			nameEnds.push(nameStart + name.length);
		}
		if (VOID_TAGS.has(lower) || selfClosing) continue;
		if (PROTOCOL_RAW_TEXT_TAGS.has(lower)) {
			const close = (lowerHtml ??= html.toLowerCase()).indexOf(`</${lower}`, at);
			at = close < 0 ? html.length : endOfTag(html, close + 2 + lower.length) + 1;
			continue;
		}
		if (lower === PROTOCOL_TEMPLATE_CONTENT_TAG) templateDepth++;
		if (FOREIGN_ROOTS.has(lower)) foreignDepth++;
		stack.push({ tag, index });
	}
	return { elements, childCounts, commentElementIndexes, nameEnds };
}

/** Writes `attribute="value"` on each element the map names by its index in servedElementTree(html). */
export function withElementAttributes(
	html: string,
	nameEnds: ReadonlyArray<number>,
	attribute: string,
	values: ReadonlyMap<number, string>,
): string {
	let out = '';
	let cursor = 0;
	for (const index of [...values.keys()].sort((left, right) => left - right)) {
		const at = nameEnds[index];
		if (!index || at === undefined) continue;
		out += `${html.slice(cursor, at)} ${attribute}="${values.get(index)!.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
		cursor = at;
	}
	return out + html.slice(cursor);
}

function endOfTag(html: string, from: number): number {
	let quote = '';
	for (let at = from; at < html.length; at++) {
		const char = html[at]!;
		if (quote) {
			if (char === quote) quote = '';
		} else if (char === '"' || char === "'") quote = char;
		else if (char === '>') return at;
	}
	return html.length - 1;
}

/**
 * The attribute value for a container whose inner html is `containerHtml`, or
 * undefined when the html holds fewer elements than the locators name.
 * One entry per located element and each of its ancestors, so every entry is
 * one step from its parent; the format is documented on PROTOCOL_LOCATOR_PATHS_DIGITS.
 */
export function servedLocatorPaths(
	containerHtml: string,
	locators: ReadonlyArray<{ readonly index: number }>,
): string | undefined {
	if (locators.length === 0) return undefined;
	const { elements, childCounts } = servedElementTree(containerHtml);
	const chain = new Set<number>();
	for (const { index } of locators) {
		if (index >= elements.length) return undefined;
		for (let at = index; at > 0 && !chain.has(at); at = elements[at]!.parent) chain.add(at);
	}
	if (chain.size === 0) return undefined;
	const tags: string[] = [];
	const parents: number[] = [];
	const stack = [0];
	let entries = '';
	let previous = 0;
	for (const index of [...chain].sort((left, right) => left - right)) {
		const { tag, parent, child } = elements[index]!;
		let up = 0;
		while (stack[stack.length - 1] !== parent) {
			stack.pop();
			up++;
		}
		if (!tags.includes(tag)) tags.push(tag);
		if (!parents.includes(parent)) parents.push(parent);
		entries +=
			pathNumber(up) +
			pathNumber(index - previous) +
			pathNumber(child) +
			pathNumber(tags.indexOf(tag));
		stack.push(index);
		previous = index;
	}
	return `${elements.length}${tags.join(',')}|${entries}|${parents.map((parent) => pathNumber(childCounts[parent]!)).join('')}|${tagOrderSignature(elements.slice(1).map((element) => element.tag))}`;
}

/** The order the served elements' tags came in, which a script moving one changes without changing the count. */
export function tagOrderSignature(tags: ReadonlyArray<string>): string {
	let signature = 0;
	for (const tag of tags) signature = (signature * 31 + tag.length * 32 + (tag.charCodeAt(0) | 32)) | 0;
	return (signature >>> 0).toString(36);
}

function pathNumber(value: number): string {
	let digits = '';
	for (; value >= 32; value = Math.floor(value / 32))
		digits += PROTOCOL_LOCATOR_PATHS_DIGITS[32 + (value % 32)];
	return digits + PROTOCOL_LOCATOR_PATHS_DIGITS[value];
}
