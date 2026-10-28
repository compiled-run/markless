/** The words a `Term` can explain, each with the one line a screen reader also hears. */
export const GLOSSARY = {
	elements: 'The building blocks of a page: headings, paragraphs, buttons, inputs.',
	events: 'What the browser tells your code when something happens, like a click, a tap or a key press.',
	values: 'Anything that produces a result, like guests.length. Written inside {\u00a0}.',
	instructions: 'Lines that run in order, top to bottom, like let\u00a0guests\u00a0=\u00a0state([]). Written inside @{\u00a0}.',
} as const;

export type TermWord = keyof typeof GLOSSARY;

export const captionOf = (word: string): string => (GLOSSARY as Record<string, string>)[word] ?? '';
