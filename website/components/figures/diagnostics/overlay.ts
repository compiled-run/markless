// What the diagnostics figure shows: the dev overlay for the page's list with no key, and the editor's warnings for the index-keyed variant, all as the compiler emits them.

/** The page's list, lines 6 to 10, with the @for header written three ways. */
export const FOR = {
	none: '@for (const item of items) {',
	keyed: '@for (const item of items; key item) {',
	index: '@for (const item of items; index i; key i) {',
};

export const ALLOW = {
	reason: '// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: a fixed list, its order never changes',
	bare: '// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX',
};

/** The error the overlay shows, as the compiler emitted it for the list with no key. */
export const ERROR = {
	code: 'MARKLESS_REPEAT_KEY_REQUIRED',
	message: '@for (const item of items) repeats reactive state without a key. When items changes, the rows of this list have no identity to update, reorder, or resume by.',
	location: 'pages/list.tsrx:8:4',
	why: 'A keyed loop item keeps its state, events, and DOM attached to the same logical item across reorder, insert, and delete; without a key there is no stable identity root.',
	fix: 'Add a stable domain key such as `@for (const item of items; key item.id)`, or key by position with `index i; key i` when state should follow the slot.',
	frame: ['   6 | \t<section>', '   7 | \t\t<ul>', '>  8 | \t\t\t@for (const item of items) {', '     |    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^', '   9 | \t\t\t\t<li>{item}</li>', '  10 | \t\t\t}'].join('\n'),
	docs: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_REQUIRED',
};

/** The warnings the editor shows for the index-keyed list. */
export const WARN = {
	index: { code: 'MARKLESS_REPEAT_KEY_IS_INDEX', message: 'key i identifies each row of items by its position, not by its data.' },
	reason: { code: 'MARKLESS_ALLOW_REASON_REQUIRED', message: 'Use `// markless-allow CODE: reason`; for this site, write `// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: reason`.' },
};

export const ITEMS = ['Milk', 'Eggs'];
