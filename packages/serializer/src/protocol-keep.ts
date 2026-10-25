// On the root element of a component output that carries no resume records: a hash of its markup, without the
// page's own children and without the values of its attribute slots. Two pages that render the same hash render the
// same bytes there apart from those values, so a navigation keeps it and sets them.
export const PROTOCOL_KEEP_ATTRIBUTE = 'data-markless-keep';
// On the element inside a kept output that holds exactly the children the page passed: a navigation replaces them.
export const PROTOCOL_OWN_ATTRIBUTE = 'data-markless-own';
// On a kept root whose attribute slots rendered values: JSON [element, name, value or null] per slot, elements counted
// in document order from the root, not counting what the page's own children hold.
export const PROTOCOL_ISLANDS_ATTRIBUTE = 'data-markless-islands';
// Starts a keep hash whose markup depends on nothing but its component's template: the same on every page that
// renders it, so a navigation may name it in the fragment address and get the part left out.
export const PROTOCOL_KEEP_SHARED_PREFIX = '~';
// On a kept root a fragment left out: only the root, its islands and its own elements' children came.
export const PROTOCOL_STUB_ATTRIBUTE = 'data-markless-stub';
