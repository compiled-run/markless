// On the root element of a component output that carries no resume records: a hash of its markup, without the
// page's own children. Two pages that render the same hash render the same bytes there, so a navigation keeps it.
export const PROTOCOL_KEEP_ATTRIBUTE = 'data-markless-keep';
// On the element inside a kept output that holds exactly the children the page passed: a navigation replaces them.
export const PROTOCOL_OWN_ATTRIBUTE = 'data-markless-own';
