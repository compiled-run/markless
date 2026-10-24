const LANGUAGES: Readonly<Record<string, string>> = { tsrx: 'tsrx', ts: 'typescript', css: 'css' };

/** The highlighter grammar for a file name; anything unknown reads as TypeScript. */
export function languageOf(file: string): string {
	return LANGUAGES[file.slice(file.lastIndexOf('.') + 1)] ?? 'typescript';
}
