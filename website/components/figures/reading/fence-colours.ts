// The colours the site's own code blocks give a .tsrx source, read from the fence renderer's HTML; run with node, since shiki's wasm engine does not load under the test runner.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Token } from './printout.ts';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (name: string, whole: string) =>
	name.startsWith('#x') ? String.fromCodePoint(parseInt(name.slice(2), 16)) : name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : (ENTITIES[name] ?? whole);

/** Splits a rendered fence into lines of runs in their light and dark colours (empty for the page's ink), skipping the hover tooltips the renderer adds. */
export function fenceRuns(html: string): Token[][] {
	const code = html.slice(html.indexOf('<code>') + 6, html.lastIndexOf('</code>'));
	const lines: Token[][] = [[]];
	const colours: [string, string][] = [];
	const kinds: ('colour' | 'tip' | 'plain')[] = [];
	let hidden = 0;
	for (const part of code.split(/(<[^>]+>)/)) {
		if (part === '') continue;
		if (part.startsWith('</')) {
			const kind = kinds.pop();
			if (kind === 'colour') colours.pop();
			if (kind === 'tip') hidden--;
			continue;
		}
		if (part.startsWith('<')) {
			const colour = part.match(/style="color:([^;"]+)/)?.[1];
			const dark = part.match(/--shiki-dark:([^;"]+)/)?.[1] ?? '';
			const tip = /class="[^"]*\btsrx-tip\b/.test(part);
			kinds.push(tip ? 'tip' : colour ? 'colour' : 'plain');
			if (tip) hidden++;
			const own = (value: string) => (value.startsWith('var(') ? '' : value.toLowerCase());
			if (colour) colours.push([own(colour), own(dark)]);
			if (/class="line"/.test(part) && lines.at(-1)!.length) lines.push([]);
			continue;
		}
		if (hidden) continue;
		const text = part.replace(/&(#?\w+);/g, (whole, name: string) => decode(name, whole));
		const pieces = text.split('\n');
		pieces.forEach((piece, i) => {
			if (i > 0) lines.push([]);
			if (piece) lines.at(-1)!.push({ content: piece, color: colours.at(-1)?.[0] ?? '', dark: colours.at(-1)?.[1] ?? '' });
		});
	}
	return lines.filter((line, i) => i < lines.length - 1 || line.length);
}

/** Every tsrx fence on a page, in order. */
export const tsrxFences = (mdx: string) => [...mdx.matchAll(/```tsrx[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]!.replace(/\n$/, ''));

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const { renderFence } = await import('../../../tooling/highlight-code.ts');
	const { SOURCE } = await import('./model.ts');
	const page = readFileSync(new URL('../../../pages/start/reading-tsrx.mdx', import.meta.url), 'utf8');
	const runs = async (code: string) => fenceRuns((await renderFence(code, 'tsrx')) ?? '');
	const out = { figure: await runs(SOURCE), page: await Promise.all(tsrxFences(page).map(runs)) };
	process.stdout.write(JSON.stringify(out));
}
