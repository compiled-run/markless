import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { expect, test } from 'vitest';
import { importedSourceReader, importedSourcesUnchanged } from '../src/imported-sources.ts';
import { transformTsrxModule } from '../src/transform.ts';

// A handler that hands a body value to an imported helper is checked against the helper's source, read on request.
const PAGE = `import { state } from '@markless/core';
import { describe } from './helpers.ts';
export function Page() @{
	let shown = state('');
	const box = { label: 'desk', items: [1] };
	<button onClick={() => (shown = describe(box))}>{shown}</button>
}
`;

function helperDirectory(helper: string) {
	const directory = mkdtempSync(join(tmpdir(), 'markless-helper-sources-'));
	writeFileSync(join(directory, 'helpers.ts'), helper);
	return directory;
}

function transform(directory: string, read = true) {
	return transformTsrxModule({
		filename: join(directory, 'Page.tsrx'),
		source: PAGE,
		buildId: 'helper-sources-test',
		readImportedSource: read
			? importedSourceReader(async (specifier, importer) => join(importer, '..', specifier))
			: async () => null,
	});
}

test('a helper that only reads the value compiles once its source is read, and the result names the source', async () => {
	const directory = helperDirectory(
		'export function describe(box: { label: string }) { return box.label.toUpperCase(); }\n',
	);
	const result = await transform(directory);
	expect(Object.values(result.importedModuleSources ?? {})).toEqual([
		{ './helpers.ts': expect.objectContaining({ filename: join(directory, 'helpers.ts') }) },
	]);
	expect(importedSourcesUnchanged(result.importedModuleSources)).toBe(true);
	writeFileSync(join(directory, 'helpers.ts'), 'export function describe() { return ""; }\n');
	expect(importedSourcesUnchanged(result.importedModuleSources)).toBe(false);
});

test('a helper that changes the value fails the build', async () => {
	const directory = helperDirectory(
		'export function describe(box: { items: number[] }) { box.items.push(2); return ""; }\n',
	);
	await expect(transform(directory)).rejects.toThrow('MARKLESS_HANDLER_WRITES_RENDER_LOCAL');
	await expect(transform(directory)).rejects.toThrow('box.items.push(2)');
});

test('a helper whose source cannot be read is refused', async () => {
	const directory = helperDirectory(
		'export function describe(box: { label: string }) { return box.label; }\n',
	);
	await expect(transform(directory, false)).rejects.toThrow('cannot see what `describe` does');
});
