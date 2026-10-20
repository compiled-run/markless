/**
 * Elements whose content the HTML parser keeps out of document order: `<template>` parses its
 * content into `template.content`, and the raw-text elements parse theirs as text (`<noscript>`
 * with scripting on). Nothing inside one is an element the DOM-order census can count, so the
 * compiler mints no host for it and the served-tree reader skips it.
 */
export const PROTOCOL_TEMPLATE_CONTENT_TAG = 'template';

/** A `<template>` carrying this attribute is consumed by the parser into a shadow root: the element itself is gone too. */
export const PROTOCOL_DECLARATIVE_SHADOW_ROOT_ATTRIBUTE = 'shadowrootmode';

export const PROTOCOL_RAW_TEXT_TAGS: ReadonlySet<string> = new Set([
	'script',
	'style',
	'textarea',
	'title',
	'xmp',
	'iframe',
	'noembed',
	'noframes',
	'noscript',
]);
