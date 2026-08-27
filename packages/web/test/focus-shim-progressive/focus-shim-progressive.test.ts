import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

/**
 * Progressive execution lets a plain button click execute the event dispatch
 * core path and nothing else. The refused-focus replay is reached only through
 * a handle read, so a module of its own would execute on every press that reads
 * no handle at all - which is what `browser/progressive-*.test.ts` measure and
 * refuse. The browser gates are the acceptance; this pins the same fact at the
 * source level, where it is cheap to run.
 */

const webSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
const dispatchCore = join(webSrc, 'resume-events.ts');

test('the dispatch core reaches the focus shim without a module of its own', () => {
	const source = readFileSync(dispatchCore, 'utf8');

	for (const name of [
		'marklessBeginFocusCommit',
		'marklessEndFocusCommit',
		'marklessHandleFocusReader',
	]) {
		expect(source).toContain(`export function ${name}`);
	}
});

test('no module outside the dispatch core path executes for a plain dispatch', () => {
	const closure = staticImportClosure(dispatchCore);

	// The walk sees `fns/` value imports at all, so the refusal below is a fact
	// about the closure rather than a walk that found nothing.
	expect(closure.some((file) => file.endsWith('/fns/instance-scope.ts'))).toBe(true);
	expect(closure.filter((file) => file.endsWith('/fns/element-handle.ts'))).toEqual([]);
});

function staticImportClosure(entry: string): string[] {
	const seen = new Set<string>();
	const pending = [entry];
	for (const file of pending) {
		if (seen.has(file)) continue;
		seen.add(file);
		let source: string;
		try {
			source = readFileSync(file, 'utf8');
		} catch {
			continue;
		}
		for (const specifier of valueImportSpecifiers(source)) {
			if (!specifier.startsWith('.')) continue;
			const resolved = resolve(dirname(file), specifier);
			if (!seen.has(resolved)) pending.push(resolved);
		}
	}
	return [...seen];
}

function valueImportSpecifiers(source: string): string[] {
	const pattern = /\b(?:import|export)\s+(?!type\b)[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
	return [...source.matchAll(pattern)]
		.filter((match) => !/^\s*(?:import|export)\s+type\b/.test(match[0]))
		.map((match) => match[1]!);
}
