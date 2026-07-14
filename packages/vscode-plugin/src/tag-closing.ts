export interface TagClosingInsertion {
	insert: string;
	at: number;
}

const voidElements = new Set([
	'area',
	'base',
	'br',
	'col',
	'command',
	'embed',
	'hr',
	'img',
	'input',
	'keygen',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

const tagNamePattern = '[@$A-Za-z_][\\w$.-]*(?::[\\w$.-]+)*';
const openingTagPattern = new RegExp(`^(${tagNamePattern})(?:\\s[\\s\\S]*)?$`);
const closingTagPattern = new RegExp(`^/\\s*(${tagNamePattern})\\s*$`);

/**
 * Returns text to insert after a user edit in a TSRX document.
 * `documentText` is the document after the edit and `changeOffset` is the edit's start offset.
 */
export function getTagClosingInsertion(
	documentText: string,
	changeOffset: number,
	changeText: string,
): TagClosingInsertion | undefined {
	if (!changeText || changeOffset < 0 || changeOffset + changeText.length > documentText.length) {
		return undefined;
	}

	const at = changeOffset + changeText.length;
	if (documentText.slice(changeOffset, at) !== changeText) return undefined;

	const code = scanCodePositions(documentText);
	if (changeText.endsWith('>')) return closingTagAfterOpening(documentText, code, at);
	if (documentText.slice(Math.max(0, at - 2), at) === '</') {
		return matchingTagAfterSlash(documentText, code, at);
	}
	return undefined;
}

function closingTagAfterOpening(
	documentText: string,
	code: Uint8Array,
	at: number,
): TagClosingInsertion | undefined {
	const typedGreaterThan = at - 1;
	if (!code[typedGreaterThan]) return undefined;

	let opening = -1;
	for (let index = typedGreaterThan - 1; index >= 0; index--) {
		if (!code[index]) continue;
		if (documentText[index] === '>') return undefined;
		if (documentText[index] === '<') {
			opening = index;
			break;
		}
	}
	if (opening < 0) return undefined;

	const inside = documentText.slice(opening + 1, typedGreaterThan);
	if (inside === '') {
		if (documentText.startsWith('</>', at)) return undefined;
		return { insert: '</>', at };
	}
	if (inside.startsWith('/') || /\/\s*$/.test(inside)) return undefined;

	const match = openingTagPattern.exec(inside);
	if (!match) return undefined;
	const tagName = match[1];
	if (!tagName || voidElements.has(tagName.toLowerCase())) return undefined;
	const closingTag = `</${tagName}>`;
	if (documentText.startsWith(closingTag, at)) return undefined;
	return { insert: closingTag, at };
}

function matchingTagAfterSlash(
	documentText: string,
	code: Uint8Array,
	at: number,
): TagClosingInsertion | undefined {
	const lessThan = at - 2;
	if (!code[lessThan] || !code[at - 1]) return undefined;

	const stack: string[] = [];
	for (let index = 0; index < lessThan; index++) {
		if (!code[index] || documentText[index] !== '<') continue;
		const end = findTagEnd(documentText, code, index + 1, lessThan);
		if (end < 0) continue;
		const inside = documentText.slice(index + 1, end);

		if (inside === '') stack.push('');
		else if (inside === '/') closeTag(stack, '');
		else if (!/\/\s*$/.test(inside)) {
			const closing = closingTagPattern.exec(inside);
			if (closing?.[1]) closeTag(stack, closing[1]);
			else {
				const opening = openingTagPattern.exec(inside);
				const tagName = opening?.[1];
				if (tagName && !voidElements.has(tagName.toLowerCase())) stack.push(tagName);
			}
		}
		index = end;
	}

	const tagName = stack.at(-1);
	if (tagName === undefined) return undefined;
	return { insert: tagName ? `${tagName}>` : '>', at };
}

function closeTag(stack: string[], tagName: string): void {
	const opening = stack.lastIndexOf(tagName);
	if (opening >= 0) stack.length = opening;
}

function findTagEnd(
	documentText: string,
	code: Uint8Array,
	from: number,
	limit: number,
): number {
	for (let index = from; index < limit; index++) {
		if (code[index] && documentText[index] === '>') return index;
		if (code[index] && documentText[index] === '<') return -1;
	}
	return -1;
}

function scanCodePositions(text: string): Uint8Array {
	const code = new Uint8Array(text.length);
	let state: 'code' | 'single' | 'double' | 'template' | 'line-comment' | 'block-comment' =
		'code';

	for (let index = 0; index < text.length; index++) {
		const character = text[index];
		const next = text[index + 1];

		if (state === 'code') {
			code[index] = 1;
			if (character === "'") state = 'single';
			else if (character === '"') state = 'double';
			else if (character === '`') state = 'template';
			else if (character === '/' && next === '/') {
				state = 'line-comment';
				code[index + 1] = 0;
				index++;
			} else if (character === '/' && next === '*') {
				state = 'block-comment';
				code[index + 1] = 0;
				index++;
			}
			continue;
		}

		if (state === 'line-comment') {
			if (character === '\n' || character === '\r') {
				code[index] = 1;
				state = 'code';
			}
			continue;
		}
		if (state === 'block-comment') {
			if (character === '*' && next === '/') {
				index++;
				state = 'code';
			}
			continue;
		}

		const quote = state === 'single' ? "'" : state === 'double' ? '"' : '`';
		if (character === '\\') index++;
		else if (character === quote) state = 'code';
	}
	return code;
}
