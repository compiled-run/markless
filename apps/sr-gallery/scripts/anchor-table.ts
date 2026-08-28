/**
 * Writes the README's section/anchor table from `FAMILY_ANCHORS`, so the anchors
 * are written down once rather than hand-copied.
 *
 *   node apps/sr-gallery/scripts/anchor-table.ts           # rewrite the table
 *   node apps/sr-gallery/scripts/anchor-table.ts --check   # exit 1 when stale
 *
 * The boot check runs `--check`, so a family added without regenerating is
 * caught by the same gate that guards the reader lanes.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FAMILY_ANCHORS } from '../preview-server.ts';

const README = fileURLToPath(new URL('../README.md', import.meta.url));

const START = '<!-- anchors:start -->';
const END = '<!-- anchors:end -->';

/** The table body, in the order `FAMILY_ANCHORS` declares its families. */
export function renderAnchorTable(): string {
	const rows = Object.entries(FAMILY_ANCHORS).map(
		([family, anchor]) => [family, `\`${anchor}\``] as const,
	);
	const headers = ['section', 'anchor'] as const;
	const widths = headers.map((header, column) =>
		Math.max(header.length, ...rows.map((row) => row[column].length)),
	);
	const line = (cells: readonly string[]) =>
		`| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
	return [
		line(headers),
		`| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
		...rows.map(line),
	].join('\n');
}

/** The README with the marked region replaced by the table the anchors imply. */
export function withAnchorTable(readme: string): string {
	const start = readme.indexOf(START);
	const end = readme.indexOf(END);
	if (start === -1 || end === -1 || end < start) {
		throw new Error(
			`apps/sr-gallery/README.md has no ${START} … ${END} region for the anchor table.`,
		);
	}
	const head = readme.slice(0, start + START.length);
	const tail = readme.slice(end);
	return `${head}\n\n${renderAnchorTable()}\n\n${tail}`;
}

/** The reason the README is stale, or null when it is current. */
export async function anchorTableDrift(): Promise<string | null> {
	const readme = await readFile(README, 'utf8');
	if (withAnchorTable(readme) === readme) return null;
	return `apps/sr-gallery/README.md's anchor table no longer matches FAMILY_ANCHORS (${Object.keys(FAMILY_ANCHORS).length} sections); run \`node apps/sr-gallery/scripts/anchor-table.ts\`.`;
}

// Only when run as the program, so the boot check can import the check above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const readme = await readFile(README, 'utf8');
	const updated = withAnchorTable(readme);
	if (process.argv.includes('--check')) {
		if (updated !== readme) {
			console.error(await anchorTableDrift());
			process.exit(1);
		}
		console.log(
			`apps/sr-gallery/README.md lists all ${Object.keys(FAMILY_ANCHORS).length} anchors.`,
		);
	} else if (updated === readme) {
		console.log('apps/sr-gallery/README.md was already current.');
	} else {
		await writeFile(README, updated);
		console.log(
			`Wrote ${Object.keys(FAMILY_ANCHORS).length} anchor rows into apps/sr-gallery/README.md.`,
		);
	}
}
