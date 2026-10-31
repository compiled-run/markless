import { readFileSync } from 'node:fs';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';

const source = (path: string) =>
	readFileSync(resolve(import.meta.dirname, '../src', path), 'utf8');

// Everything from the announcer's state type to the end of announcePage, without export keywords.
const announcer = (code: string) => {
	const start = code.indexOf('type Announcer');
	const end = code.indexOf('\n}\n', code.indexOf('function announcePage')) + 3;
	return code.slice(start, end).replaceAll('export function', 'function');
};

test('the fragment swap and the client renderer announce pages with the same code', () => {
	const shared = announcer(source('spa-navigation.ts'));
	expect(shared).toContain('function announcePage');
	expect(announcer(source('vite/entries/fragment-entry.ts'))).toBe(shared);
});
