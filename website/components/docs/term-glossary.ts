/** The words a `Term` can explain, each with the one line a screen reader also hears. */
export const GLOSSARY = {
	elements: 'The building blocks of a page: headings, paragraphs, buttons, inputs.',
	events: 'What the browser tells your code when something happens, like a click, a tap or a key press.',
} as const;

export type TermWord = keyof typeof GLOSSARY;

export const captionOf = (word: string): string => (GLOSSARY as Record<string, string>)[word] ?? '';
