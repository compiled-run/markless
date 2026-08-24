// Blanks the text of strings, template literals, and comments so a source scan
// sees only code. Interpolation bodies survive because `${}` is code, not text.
export function sourceWithoutStringOrCommentText(source: string): string {
	let result = '';
	let quote: string | null = null;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	// A template literal blanks its text but keeps its `${}` expressions, so an
	// identifier used only inside an interpolation stays visible to the scan. The
	// stack carries that nesting: each frame is either a template or the code of
	// one interpolation, whose own braces have to balance before `}` closes it.
	const frames: Array<{ readonly template: boolean; braceDepth: number }> = [
		{ template: false, braceDepth: 0 },
	];

	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? '';
		const next = source[index + 1] ?? '';
		const frame = frames[frames.length - 1] ?? { template: false, braceDepth: 0 };

		if (lineComment) {
			if (char === '\n') {
				lineComment = false;
				result += char;
			} else {
				result += ' ';
			}
			continue;
		}

		if (blockComment) {
			if (char === '*' && next === '/') {
				blockComment = false;
				result += '  ';
				index++;
			} else {
				result += char === '\n' ? char : ' ';
			}
			continue;
		}

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			result += ' ';
			continue;
		}

		if (frame.template) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === '`') {
				frames.pop();
			} else if (char === '$' && next === '{') {
				frames.push({ template: false, braceDepth: 0 });
				result += '  ';
				index++;
				continue;
			}
			result += ' ';
			continue;
		}

		if (char === '/' && next === '/') {
			lineComment = true;
			result += '  ';
			index++;
			continue;
		}

		if (char === '/' && next === '*') {
			blockComment = true;
			result += '  ';
			index++;
			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			result += ' ';
			continue;
		}

		if (char === '`') {
			frames.push({ template: true, braceDepth: 0 });
			result += ' ';
			continue;
		}

		if (char === '{') {
			frame.braceDepth++;
			result += char;
			continue;
		}

		if (char === '}') {
			if (frame.braceDepth === 0 && frames.length > 1) {
				frames.pop();
				result += ' ';
				continue;
			}
			if (frame.braceDepth > 0) frame.braceDepth--;
			result += char;
			continue;
		}

		result += char;
	}

	return result;
}
