// Colours the printed guest-list file with the site's TSRX grammar and code themes; the JavaScript regex engine because the wasm one does not load under the test runner.
import { readFile } from 'node:fs/promises';
import { createHighlighter, type HighlighterGeneric, type LanguageRegistration } from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { LIGHT_THEME } from '../../../tooling/shiki-surface.ts';
import { TSRX_GRAMMAR_URL } from '../../../tooling/highlight-code.ts';
import { SOURCE } from './model.ts';
import type { Token } from './printout.ts';

/** The file's tokens line by line in the light code theme, since the sheet stays light paper in both site themes; plain-foreground tokens get no colour, so they print in the sheet's ink. */
export async function tokensOf(): Promise<Token[][]> {
	const grammar = JSON.parse(await readFile(TSRX_GRAMMAR_URL, 'utf8')) as LanguageRegistration;
	const highlighter = await createHighlighter({ themes: [LIGHT_THEME], langs: ['jsx', 'tsx', 'css', { ...grammar, embeddedLangs: ['jsx', 'tsx', 'css'], name: 'tsrx' }], engine: createJavaScriptRegexEngine() }) as HighlighterGeneric<string, string>;
	const { tokens, fg } = highlighter.codeToTokens(SOURCE, { lang: 'tsrx', theme: LIGHT_THEME });
	const plain = (fg ?? '').toLowerCase();
	return tokens.map((line) => line.map((token) => ({ content: token.content, color: (token.color ?? '').toLowerCase() === plain ? '' : (token.color ?? '').toLowerCase() })));
}
