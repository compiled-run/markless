/** ECMAScript's global conversion functions: each answers from its arguments alone, in every host. */
export const GLOBAL_CONVERSION_FUNCTIONS: ReadonlySet<string> = new Set([
	'String',
	'Number',
	'Boolean',
	'parseInt',
	'parseFloat',
	'isNaN',
	'isFinite',
	'encodeURIComponent',
	'encodeURI',
	'decodeURIComponent',
	'decodeURI',
]);
