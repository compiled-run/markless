import type { DrawingElement } from './native-drawing.ts';

// An .svg file the app serves (a sprite of <symbol>s), read as XML 1.0 when the app is built: elements and attributes only.

export type SvgFile =
	| { readonly elements: ReadonlyArray<DrawingElement> }
	| { readonly error: string };

const ENTITIES: Readonly<Record<string, string>> = {
	lt: '<',
	gt: '>',
	amp: '&',
	quot: '"',
	apos: "'",
};

const isNameChar = (char: string | undefined) =>
	char !== undefined && /[\p{L}\p{N}_:.\-·]/u.test(char);
const isSpace = (char: string | undefined) =>
	char === ' ' || char === '\t' || char === '\n' || char === '\r';

/**
 * The elements under the file's root `<svg>`, in document order, each with its child-index path relative to that root, as
 * `compileDrawing` takes an inline svg's; `id` is left empty for the caller. Text, comments and declarations are skipped.
 */
export function readSvgFile(text: string): SvgFile {
	const elements: DrawingElement[] = [];
	const open: { readonly tag: string; readonly path: ReadonlyArray<number>; next: number }[] = [];
	let at = 0;
	let rooted = false;
	const name = () => {
		const start = at;
		while (isNameChar(text[at])) at++;
		return text.slice(start, at);
	};
	const skipSpace = () => {
		while (isSpace(text[at])) at++;
	};
	const decode = (raw: string): string | { readonly error: string } => {
		let out = '';
		let from = 0;
		for (let amp = raw.indexOf('&'); amp >= 0; amp = raw.indexOf('&', from)) {
			const end = raw.indexOf(';', amp);
			if (end < 0) return { error: 'an `&` that starts no entity' };
			const entity = raw.slice(amp + 1, end);
			const code = entity.startsWith('#x')
				? Number.parseInt(entity.slice(2), 16)
				: entity.startsWith('#')
					? Number.parseInt(entity.slice(1), 10)
					: undefined;
			const value =
				code === undefined
					? ENTITIES[entity]
					: Number.isInteger(code) && code >= 0 && code <= 0x10ffff
						? String.fromCodePoint(code)
						: undefined;
			if (value === undefined) return { error: `the entity \`&${entity};\`, which XML does not define` };
			out += raw.slice(from, amp) + value;
			from = end + 1;
		}
		return out + raw.slice(from);
	};
	const skipTo = (end: string, what: string): string | undefined => {
		const found = text.indexOf(end, at);
		if (found < 0) return `${what} that never ends`;
		at = found + end.length;
		return undefined;
	};

	while (at < text.length) {
		const lt = text.indexOf('<', at);
		const run = text.slice(at, lt < 0 ? text.length : lt);
		if (open.length === 0 && run.trim() !== '') return { error: 'text outside the root <svg>' };
		if (lt < 0) break;
		at = lt;
		let skipped: string | undefined;
		if (text.startsWith('<!--', at)) skipped = skipTo('-->', 'a comment');
		else if (text.startsWith('<?', at)) skipped = skipTo('?>', 'a processing instruction');
		else if (text.startsWith('<![CDATA[', at)) {
			if (open.length === 0) return { error: 'a CDATA section outside the root <svg>' };
			skipped = skipTo(']]>', 'a CDATA section');
		} else if (text.startsWith('<!DOCTYPE', at)) {
			const end = text.indexOf('>', at);
			if (end < 0) return { error: 'a DOCTYPE that never ends' };
			if (text.slice(at, end).includes('['))
				return { error: 'a DOCTYPE that declares entities, which the build does not read' };
			at = end + 1;
		} else if (text.startsWith('</', at)) {
			at += 2;
			const tag = name();
			skipSpace();
			if (text[at] !== '>') return { error: `the end tag </${tag}> does not end with \`>\`` };
			at++;
			const top = open.pop();
			if (!top) return { error: `</${tag}> closes no element` };
			if (top.tag !== tag) return { error: `<${top.tag}> is closed by </${tag}>` };
		} else {
			at++;
			const tag = name();
			if (tag === '') return { error: 'a `<` that starts no element' };
			const attributes: Record<string, string> = {};
			for (;;) {
				const before = at;
				skipSpace();
				if (text.startsWith('/>', at) || text[at] === '>') break;
				if (at === before) return { error: `<${tag}> has an attribute with no space before it` };
				const attribute = name();
				if (attribute === '') return { error: `<${tag}> never ends` };
				skipSpace();
				if (text[at] !== '=') return { error: `\`${attribute}\` on <${tag}> has no value` };
				at++;
				skipSpace();
				const quote = text[at];
				if (quote !== '"' && quote !== "'")
					return { error: `\`${attribute}\` on <${tag}> is not quoted` };
				const end = text.indexOf(quote, at + 1);
				if (end < 0) return { error: `\`${attribute}\` on <${tag}> never ends` };
				const raw = text.slice(at + 1, end);
				if (raw.includes('<')) return { error: `\`${attribute}\` on <${tag}> holds a \`<\`` };
				const value = decode(raw);
				if (typeof value !== 'string') return value;
				if (Object.hasOwn(attributes, attribute))
					return { error: `<${tag}> has \`${attribute}\` twice` };
				attributes[attribute] = value;
				at = end + 1;
			}
			const empty = text.startsWith('/>', at);
			at += empty ? 2 : 1;
			const parent = open.at(-1);
			if (!parent) {
				if (rooted) return { error: 'a second root element after the <svg>' };
				if (tag !== 'svg') return { error: `the root element is <${tag}>, not <svg>` };
				rooted = true;
				if (!empty) open.push({ tag, path: [], next: 0 });
				continue;
			}
			const path = [...parent.path, parent.next++];
			elements.push({ id: '', tag, path, attributes, bound: [] });
			if (!empty) open.push({ tag, path, next: 0 });
		}
		if (skipped) return { error: skipped };
	}
	if (open.length > 0) return { error: `<${open.at(-1)!.tag}> is never closed` };
	if (!rooted) return { error: 'it has no <svg> element' };
	return { elements };
}
