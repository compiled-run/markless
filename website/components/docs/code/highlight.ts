// The build's themes, grammar and surface pass, on shiki's JavaScript regex engine so no Oniguruma wasm ships.
// Spans come straight from shiki's tokens, the way its own HTML output writes them, so no HTML serializer ships.
import {
	codeToTokens,
	createShikiInternal,
	type LanguageRegistration,
	type ThemedToken,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import css from 'shiki/langs/css.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import tsrxGrammar from '../../../tooling/tsrx.tmLanguage.json';
import { DARK_THEME, LIGHT_THEME, useSiteSurface } from '../../../tooling/shiki-surface.ts';
import { languageOf } from './languages.ts';

type ShikiInternal = Awaited<ReturnType<typeof createShikiInternal>>;

export type Highlighter = {
	/** The inner markup of each line, one entry per line of `code`, in the build's dual-theme spans. */
	lines(code: string, file: string): string[];
};

const WHITESPACE_ONLY = /^\s+$/;
// Shiki's FontStyle.Underline | FontStyle.Strikethrough.
const DECORATED = 4 | 8;

function escapeText(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// Shiki's HTML output folds a whitespace-only token into the token after it.
function mergeWhitespace(line: readonly ThemedToken[]): ThemedToken[] {
	const merged: ThemedToken[] = [];
	let carried = '';
	line.forEach((token, index) => {
		const mergeable = !(token.fontStyle && token.fontStyle & DECORATED);
		if (mergeable && WHITESPACE_ONLY.test(token.content) && line[index + 1]) carried += token.content;
		else if (carried) {
			if (mergeable) merged.push({ ...token, content: carried + token.content });
			else merged.push({ content: carried, offset: token.offset }, token);
			carried = '';
		} else merged.push(token);
	});
	return merged;
}

function styleOf(token: ThemedToken): string {
	const style = token.htmlStyle;
	if (style) return Object.entries(style).map(([key, value]) => `${key}:${value}`).join(';');
	return token.color ? `color:${token.color}` : '';
}

function fromInternal(internal: ShikiInternal): Highlighter {
	const light = internal.getTheme(LIGHT_THEME).fg;
	const dark = internal.getTheme(DARK_THEME).fg;
	return {
		lines(code, file) {
			let tokens: ThemedToken[][];
			try {
				tokens = codeToTokens(internal, code, {
					lang: languageOf(file),
					themes: { light: LIGHT_THEME, dark: DARK_THEME },
					defaultColor: 'light',
				}).tokens;
			} catch {
				return code.split('\n').map(escapeText);
			}
			const lines = tokens.map((line) =>
				mergeWhitespace(line)
					.map((token) => {
						const style = styleOf(token);
						const text = token.content.replaceAll('&', '&#x26;').replaceAll('<', '&#x3C;');
						return style ? `<span style="${style}">${text}</span>` : `<span>${text}</span>`;
					})
					.join(''),
			);
			const surfaced = useSiteSurface(lines.join('\n'), light, dark).split('\n');
			const want = code.split('\n').length;
			while (surfaced.length < want) surfaced.push('');
			return surfaced;
		},
	};
}

let internal: Promise<ShikiInternal> | undefined;
let typescript: Promise<void> | undefined;

/** The highlighter for a block's files; the TypeScript grammar loads only when one of them needs it. */
export async function loadHighlighter(files: readonly string[]): Promise<Highlighter> {
	internal ??= createShikiInternal({
		themes: [githubLight, githubDark],
		langs: [
			css,
			{
				...(tsrxGrammar as unknown as LanguageRegistration),
				// The tsrx grammar includes no grammar but source.css.
				embeddedLangs: ['css'],
				name: 'tsrx',
			},
		],
		engine: createJavaScriptRegexEngine({ forgiving: true }),
	});
	const loaded = await internal;
	if (files.some((file) => languageOf(file) === 'typescript'))
		await (typescript ??= import('./typescript-grammar.ts').then((grammar) =>
			loaded.loadLanguage(grammar.default),
		));
	return fromInternal(loaded);
}
