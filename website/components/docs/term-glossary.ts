/** The words a `Term` can explain, each with the one line a screen reader also hears. */
export const GLOSSARY = {
	elements: 'The building blocks of a page: headings, text, buttons, inputs.',
	events: 'Things a person does: a click, a tap, a key press.',
	values: 'Anything that produces a result, like guests.length. Written inside {\u00a0}.',
	instructions: 'Lines that run in order, top to bottom, like let\u00a0guests\u00a0=\u00a0state([]). Written inside @{\u00a0}.',
	state: 'A variable the page watches: change it, and every spot that shows it updates.',
	computed: 'A value worked out from other values, and worked out again when they change.',
	component: 'A function that returns a piece of page you can use again, like a card or a menu.',
	prop: 'A value one component hands to another, written like an HTML attribute.',
	handle: 'A name that points at one real element on the page, once that element exists.',
	storage: 'A value kept in the browser, so it is still there after a reload.',
	shared: 'One value that several components read and change together.',
	route: 'One address in your app, and the page file that answers it.',
	slug: 'The readable part of an address that names one item, like hello-world in /blog/hello-world.',
	stream: 'A response sent in parts, so the first part shows before the last part is ready.',
	chunk: 'One file of code the browser downloads on its own.',
	payload: 'The data the server sends with the page so the browser can carry on from it.',
	resume: 'To carry on in the browser from where the server stopped, without starting the page again.',
	compile: 'To turn your source files into the code that actually runs.',
	analyzer: 'The part of the build that reads your whole app before anyone visits it.',
	preset: 'A named setting that shapes the build for one kind of host.',
} as const;

export type TermWord = keyof typeof GLOSSARY;

export const captionOf = (word: string): string => (GLOSSARY as Record<string, string>)[word] ?? '';
