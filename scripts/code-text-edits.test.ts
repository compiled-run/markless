import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { codeTextEdits } from './code-text-edits.ts';

// Emitted and generated code is edited from the build's facts or the compiler's binding analysis, never by text
// search: a regex once deleted a dialog's showOthers() call because the minifier reused a short name. This list
// holds today's text-search edits; it may only shrink.
const root = fileURLToPath(new URL('..', import.meta.url));
const allowlist = JSON.parse(
	readFileSync(new URL('./code-text-edits.allowlist.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, number | string>>;

const counts = (entry: Record<string, number | string>) =>
	Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'kind' && key !== 'note'));

test('no build package adds a text-search edit beyond the list of today’s', () => {
	const added: string[] = [];
	for (const [key, found] of codeTextEdits(root)) {
		const allowed = allowlist[key] ? counts(allowlist[key]) : {};
		for (const [kind, count] of Object.entries(found))
			if (count > Number(allowed[kind] ?? 0))
				added.push(`${key}: ${kind} ${count} (allowed ${allowed[kind] ?? 0})`);
	}
	expect(added, 'edit emitted or generated code from parsed facts, not by text search').toEqual(
		[],
	);
});

test('the list shrinks as text-search edits go away', () => {
	const found = codeTextEdits(root);
	const stale: string[] = [];
	for (const [key, entry] of Object.entries(allowlist))
		for (const [kind, count] of Object.entries(counts(entry)))
			if ((found.get(key)?.[kind] ?? 0) < Number(count))
				stale.push(`${key}: ${kind} ${found.get(key)?.[kind] ?? 0} (listed ${count})`);
	expect(stale, 'lower these entries in scripts/code-text-edits.allowlist.json').toEqual([]);
});

test('the scan sees a regex replace, a RegExp and a searched splice', async () => {
	const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
	const { join } = await import('node:path');
	const { tmpdir } = await import('node:os');
	const scratch = mkdtempSync(join(tmpdir(), 'code-text-edits-'));
	mkdirSync(join(scratch, 'packages/bundler/src'), { recursive: true });
	mkdirSync(join(scratch, 'packages/router/src'), { recursive: true });
	mkdirSync(join(scratch, 'packages/compiler/src'), { recursive: true });
	writeFileSync(
		join(scratch, 'packages/bundler/src/strip.ts'),
		[
			'export function strip(code: string) { return code.replace(/,l\\(\\),/g, ","); }',
			'export const find = (name: string) => new RegExp(name);',
			'export function cut(code: string) { const at = code.indexOf("x"); return code.slice(0, at); }',
			'export const parts = [(code: string) => code.indexOf("x"), (code: string) => code.slice(1)];',
		].join('\n'),
	);
	expect(Object.fromEntries(codeTextEdits(scratch))).toEqual({
		'packages/bundler/src/strip.ts#strip': { replace: 1 },
		'packages/bundler/src/strip.ts#find': { RegExp: 1 },
		'packages/bundler/src/strip.ts#cut': { 'search-splice': 1 },
	});
});
