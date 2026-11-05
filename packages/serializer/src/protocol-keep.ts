// On the root element of a component output a navigation can keep: a hash of its markup without the page's own
// children and the values that differ between pages. Two pages that render the same hash render the same part there.
export const PROTOCOL_KEEP_ATTRIBUTE = 'data-markless-keep';
// On the element inside a kept output that holds exactly the children the page passed: a navigation replaces them.
export const PROTOCOL_OWN_ATTRIBUTE = 'data-markless-own';
// On an element inside a kept output: the attributes its props or records set, which differ between pages; a
// navigation takes the next page's values for exactly these, and leaves every other attribute as it is.
export const PROTOCOL_VARY_ATTRIBUTE = 'data-markless-vary';
// On the root of a kept output that has state of its own: the instance path its graph nodes carry on this page. A
// navigation that keeps it hands the live values of those nodes to the next page's instance.
export const PROTOCOL_KEEP_INSTANCE_ATTRIBUTE = 'data-markless-instance';
// In a vary mark: the element's own text, which its part writes, differs between pages.
export const PROTOCOL_VARY_TEXT = '#text';
