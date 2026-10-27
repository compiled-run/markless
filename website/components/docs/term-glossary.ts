/** The words a `Term` can explain, each with the one line a screen reader also hears. */
export const GLOSSARY = {
	elements: 'The building blocks of a page: headings, text, buttons, inputs.',
	events: 'Things a person does: a click, a tap, a key press.',
	values: 'Anything that produces a result, like guests.length. Written inside {\u00a0}.',
	instructions: 'Lines that run in order, top to bottom, like let\u00a0guests\u00a0=\u00a0state([]). Written inside @{\u00a0}.',
} as const;

export type TermWord = keyof typeof GLOSSARY;

export const captionOf = (word: string): string => (GLOSSARY as Record<string, string>)[word] ?? '';
