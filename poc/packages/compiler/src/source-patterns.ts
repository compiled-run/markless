import { anyOf, createRegExp } from 'magic-regexp';

export const pocSecretWarningTextPattern = createRegExp(
	anyOf('secret', 'token', 'password', 'credential', 'apikey'),
);
