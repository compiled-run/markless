/** The words a `Term` can explain, each with the one line a screen reader also hears. */
export const GLOSSARY = {
	elements: 'The building blocks of a page: headings, text, buttons, inputs.',
	events: 'Things a person does: a click, a tap, a key press.',
} as const;

export type TermWord = keyof typeof GLOSSARY;

export const captionOf = (word: string): string => (GLOSSARY as Record<string, string>)[word] ?? '';
