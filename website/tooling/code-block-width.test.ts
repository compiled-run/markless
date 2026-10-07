import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findCodeBlocks } from './code-blocks.ts';

// Matches the code column of a <Code> block shown beside its live preview.
const CODE_BLOCK_MAX_COLUMNS = 50;
const TAB_COLUMNS = 2;

const pages = fileURLToPath(new URL('../pages', import.meta.url));

function mdxFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return mdxFiles(path);
		return entry.name.endsWith('.mdx') ? [path] : [];
	});
}

function columns(line: string): number {
	return line.replaceAll('\t', ' '.repeat(TAB_COLUMNS)).length;
}

describe('<Code> block line width', () => {
	const files = mdxFiles(pages);

	it('finds pages with <Code> blocks', () => {
		const withBlocks = files.filter(
			(file) => findCodeBlocks(readFileSync(file, 'utf8'), file).length > 0,
		);
		expect(withBlocks.length).toBeGreaterThan(10);
	});

	it(`keeps every line within ${CODE_BLOCK_MAX_COLUMNS} columns`, () => {
		const tooLong: string[] = [];
		for (const file of files) {
			const source = readFileSync(file, 'utf8');
			const pageLines = source.split('\n');
			for (const block of findCodeBlocks(source, file)) {
				let at = block.startLine + 1;
				for (const codeFile of block.files) {
					while (!pageLines[at]!.includes(`title="${codeFile.name}"`)) at++;
					const fenceLine = at;
					codeFile.code.split('\n').forEach((line, index) => {
						if (columns(line) <= CODE_BLOCK_MAX_COLUMNS) return;
						tooLong.push(
							`${relative(pages, file)}:${fenceLine + index + 2} (${codeFile.name}) ` +
								`is ${columns(line)} columns: ${line.trim()}`,
						);
					});
					at++;
				}
			}
		}
		expect(tooLong).toEqual([]);
	});
});
