import { anyOf, createRegExp } from 'magic-regexp';

export const pocSecretKeyPrefixPattern = createRegExp(
	anyOf('sk', 'pk').at.lineStart(),
	'_',
	anyOf('live', 'test'),
	'_',
);
export const pocSecretValuePattern = createRegExp(anyOf('secret', 'token'));
export const pocSecretPathPattern = createRegExp(
	anyOf('secret', 'token', 'password', 'credential'),
);
