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
const RAW_TEXT_TAGS = new Set([
	'script',
	'style',
	'textarea',
	'title',
	'xmp',
	'iframe',
	'noembed',
	'noframes',
	'noscript',
]);
const FOREIGN_ROOTS = new Set(['svg', 'math']);

type ServedElement = {
	readonly tag: string;
	readonly parent: number;
	/** Its place among the parent's element children. */
	readonly child: number;
};

type ServedTree = {
	/** Every element the browser counts under the container, in DOM order; the container is 0. */
	readonly elements: ReadonlyArray<ServedElement>;
	readonly childCounts: ReadonlyArray<number>;
};

export function servedElementTree(html: string): ServedTree {
	const elements: ServedElement[] = [{ tag: '', parent: -1, child: 0 }];
	const childCounts = [0];
	const stack: Array<{ readonly tag: string; readonly index: number }> = [];
	let templateDepth = 0;
	let foreignDepth = 0;
	let at = 0;
	let lowerHtml: string | undefined;
	while (at < html.length) {
		const open = html.indexOf('<', at);
		if (open < 0) break;
		if (html.startsWith('<!--', open)) {
			const end = html.indexOf('-->', open + 4);
			at = end < 0 ? html.length : end + 3;
			continue;
		}
		const next = html[open + 1] ?? '';
		if (next === '!' || next === '?') {
			const end = html.indexOf('>', open);
			at = end < 0 ? html.length : end + 1;
			continue;
		}
		const closing = next === '/';
		const nameStart = closing ? open + 2 : open + 1;
		const nameMatch = /^[a-zA-Z][^\s/>]*/.exec(html.slice(nameStart, nameStart + 64));
		if (!nameMatch) {
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
				if (popped.tag.toLowerCase() === 'template') templateDepth--;
				if (FOREIGN_ROOTS.has(popped.tag.toLowerCase())) foreignDepth--;
			}
			continue;
		}
		const selfClosing = foreignDepth > 0 && html[tagEnd - 1] === '/';
		const parent = stack.length ? stack[stack.length - 1]!.index : 0;
		let index = parent;
		if (templateDepth === 0) {
			index = elements.push({ tag, parent, child: childCounts[parent]!++ }) - 1;
			childCounts.push(0);
		}
		if (VOID_TAGS.has(lower) || selfClosing) continue;
		if (RAW_TEXT_TAGS.has(lower)) {
			const close = (lowerHtml ??= html.toLowerCase()).indexOf(`</${lower}`, at);
			at = close < 0 ? html.length : endOfTag(html, close + 2 + lower.length) + 1;
			continue;
		}
		if (lower === 'template') templateDepth++;
		if (FOREIGN_ROOTS.has(lower)) foreignDepth++;
		stack.push({ tag, index });
	}
	return { elements, childCounts };
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
 * one step from its parent: `index,parent,siblings,child,tag`, where `siblings`
 * is how many element children the parent was served with.
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
	const entries = [...chain]
		.sort((left, right) => left - right)
		.map((index) => {
			const { tag, parent, child } = elements[index]!;
			return `${index},${parent},${childCounts[parent]},${child},${tag}`;
		});
	return [elements.length, ...entries].join(';');
}
