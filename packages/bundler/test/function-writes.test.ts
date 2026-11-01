import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { expect, test } from 'vitest';
import {
	importedFunctionWrites,
	missingFunctionWriteSources,
} from '../src/hooks/function-writes.ts';
import type { LinkResolveContext } from '../src/link-driver.ts';

const dir = mkdtempSync(join(tmpdir(), 'markless-function-writes-'));
const helperFile = join(dir, 'shelf.ts');
writeFileSync(
	helperFile,
	`export function shelve(book: { place: string; tags: string[] }, place: string) {
	book.place = place;
	book.tags.push(place);
}
`,
);
const packageFile = join(dir, 'node_modules', 'pkg', 'index.js');
mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
writeFileSync(packageFile, `export function shelve(book) { book.place = 'x'; }\n`);

const watched: string[] = [];
const context = {
	resolve: async (specifier: string) =>
		specifier === './shelf.ts' ? helperFile : specifier === 'pkg' ? packageFile : null,
	addWatchFile: (file: string) => watched.push(file),
} as unknown as LinkResolveContext;

test('a project module is read for what each export writes, and a package or unresolved import is not', async () => {
	const writes = await importedFunctionWrites(context, join(dir, 'Page.tsrx'), [
		'./shelf.ts',
		'pkg',
		'./missing.ts',
	]);

	expect(writes).toEqual({
		'./shelf.ts': { shelve: { parameters: [[{ path: ['place'] }, { path: ['tags'] }], []] } },
		pkg: {},
		'./missing.ts': {},
	});
	expect(watched).toEqual([helperFile]);
	expect(missingFunctionWriteSources(['./shelf.ts', './other.ts'], writes)).toEqual([
		'./other.ts',
	]);
});
