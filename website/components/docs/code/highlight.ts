// The build's themes, grammar and surface pass, on shiki's JavaScript regex engine so no Oniguruma wasm ships.
import { createHighlighterCore, type HighlighterCore, type LanguageRegistration } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import css from 'shiki/langs/css.mjs';
import jsx from 'shiki/langs/jsx.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import tsrxGrammar from '../../../tooling/tsrx.tmLanguage.json';
import { DARK_THEME, LIGHT_THEME, useSiteSurface } from '../../../tooling/shiki-surface.ts';

const LANGUAGES: Readonly<Record<string, string>> = { tsrx: 'tsrx', ts: 'typescript', css: 'css' };

export type Highlighter = {
	/** The inner markup of each line, one entry per line of `code`, in the build's dual-theme spans. */
	lines(code: string, file: string): string[];
};

export function languageOf(file: string): string {
	return LANGUAGES[file.slice(file.lastIndexOf('.') + 1)] ?? 'typescript';
}

function escapeText(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function fromCore(core: HighlighterCore): Highlighter {
	const light = core.getTheme(LIGHT_THEME).fg;
	const dark = core.getTheme(DARK_THEME).fg;
	return {
		lines(code, file) {
			let html: string;
			try {
				html = core.codeToHtml(code, {
					lang: languageOf(file),
					themes: { light: LIGHT_THEME, dark: DARK_THEME },
					defaultColor: 'light',
				});
			} catch {
				return code.split('\n').map(escapeText);
			}
			const surfaced = useSiteSurface(html, light, dark);
			const body = surfaced.slice(
				surfaced.indexOf('>', surfaced.indexOf('<code')) + 1,
				surfaced.lastIndexOf('</code>'),
			);
			// Shiki joins lines with a bare newline; tokens never hold one.
			const lines = body
				.split('\n')
				.map((line) => line.replace(/^<span class="line">/, '').replace(/<\/span>$/, ''));
			const want = code.split('\n').length;
			while (lines.length < want) lines.push('');
			return lines;
		},
	};
}

let loading: Promise<Highlighter> | undefined;

export function loadHighlighter(): Promise<Highlighter> {
	loading ??= createHighlighterCore({
		themes: [githubLight, githubDark],
		langs: [
			typescript,
			jsx,
			tsx,
			css,
			{
				...(tsrxGrammar as unknown as LanguageRegistration),
				embeddedLangs: ['jsx', 'tsx', 'css'],
				name: 'tsrx',
			},
		],
		engine: createJavaScriptRegexEngine({ forgiving: true }),
	}).then(fromCore);
	return loading;
}
