import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	buildErrorData,
	orphanGuides,
	readSourceFiles,
	scanCodes,
	segments,
	type Highlight,
	type SourceFile,
} from './errors.ts';

const plain: Highlight = async (code) =>
	code.split('\n').map((text, index) => ({
		id: `l${index}`,
		runs: [{ id: 'r0', text, style: '' }],
	}));

function file(rel: string, src: string, pkg = '@markless/compiler'): SourceFile {
	return { rel, pkg, src };
}

describe('scanCodes', () => {
	it('reads a structured diagnostic: severity, message template, why, first suggestion and docs link', () => {
		const [entry] = scanCodes([
			file(
				'packages/compiler/src/passes/rows.ts',
				`export function rowKey(name: string) {
	return {
		code: 'MARKLESS_ROW_KEY_MISSING',
		severity: 'warning',
		title: 'Row has no key',
		message: \`Row \${name} has no key.\`,
		why: 'Rows need identity.',
		suggestions: [{ message: 'Add a key.' }, { message: 'Ignored.' }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ROW_KEY_MISSING',
	};
}`,
			),
		]);
		expect(entry).toMatchObject({
			code: 'MARKLESS_ROW_KEY_MISSING',
			pkg: '@markless/compiler',
			stage: 'compile',
			severity: 'warning',
			message: 'Row <name> has no key.',
			why: 'Rows need identity.',
			suggestion: 'Add a key.',
			printsDocsLink: true,
			structured: true,
		});
	});

	it('resolves a code held in a constant and a code expanded from a template', () => {
		const codes = scanCodes([
			file(
				'packages/web/src/rows.ts',
				`const SLOT_CODE = 'MARKLESS_SLOT_TAKEN';
export function fail() {
	throw new Error(\`\${SLOT_CODE}: the slot is taken by another row.\`);
}
export function check(kind: string) {
	const part = kind === 'a' ? 'LEFT' : 'RIGHT';
	throw new Error(\`MARKLESS_\${part}_EDGE: edge is missing.\`);
}`,
				'@markless/web',
			),
		]).map((entry) => [entry.code, entry.stage, entry.message]);
		expect(codes).toEqual([
			['MARKLESS_LEFT_EDGE', 'runtime', 'edge is missing.'],
			['MARKLESS_RIGHT_EDGE', 'runtime', 'edge is missing.'],
			['MARKLESS_SLOT_TAKEN', 'runtime', 'the slot is taken by another row.'],
		]);
	});

	it('marks a code that only appears in a type or a comparison as never raised', () => {
		const [entry] = scanCodes([
			file(
				'packages/core/src/types.ts',
				`type Code = 'MARKLESS_ONLY_NAMED' | 'MARKLESS_OTHER';
export const is = (code: string) => code === 'MARKLESS_ONLY_NAMED';`,
				'@markless/core',
			),
		]);
		expect(entry).toMatchObject({ code: 'MARKLESS_ONLY_NAMED', referenceOnly: true });
	});

	it('renders a class-field template instead of leaving its placeholder markers', () => {
		const [entry] = scanCodes([
			file(
				'packages/core/src/api.ts',
				`export class ApiError extends Error {
	readonly code = 'MARKLESS_API_RAN';
	readonly title = 'API ran';
	readonly why: string;
	constructor(name: string) {
		super(name);
		this.why = \`\${name}() must be compiled.\`;
	}
}`,
				'@markless/core',
			),
		]);
		expect(entry?.title).toBe('API ran');
		expect(JSON.stringify(entry)).not.toMatch(/\uE000/);
	});
});

describe('segments', () => {
	it('splits inline code and links out of a sentence', () => {
		expect(segments('Use `@else`, see [the rules](/start/reading-tsrx).')).toEqual([
			{ id: 's0', text: 'Use ' },
			{ id: 's1', text: '@else', code: true },
			{ id: 's2', text: ', see ' },
			{ id: 's3', text: 'the rules', href: '/start/reading-tsrx' },
			{ id: 's4', text: '.' },
		]);
	});
});

describe('buildErrorData', () => {
	it('groups codes by package, attaches guides, and offers an allow line for compile warnings only', async () => {
		const scanned = scanCodes([
			file(
				'packages/compiler/src/a.ts',
				`export const a = { code: 'MARKLESS_A_WARN', severity: 'warning', title: 'A', why: 'w', docsUrl: 'https://markless.dev/errors/MARKLESS_A_WARN' };`,
			),
			file(
				'packages/web/src/b.ts',
				`throw new Error('MARKLESS_B_FAIL: b failed.');`,
				'@markless/web',
			),
		]);
		const data = await buildErrorData(scanned, plain, {
			MARKLESS_B_FAIL: {
				summary: 'B failed.',
				what: 'It `failed`.',
				how: 'Retry.',
				example: ['retry();'],
			},
		});
		expect(data.index.groups.map((group) => [group.packageName, group.codes])).toEqual([
			[
				'@markless/compiler',
				[{ code: 'MARKLESS_A_WARN', kind: 'compile warning', guided: false }],
			],
			['@markless/web', [{ code: 'MARKLESS_B_FAIL', kind: 'runtime error', guided: true }]],
		]);
		const [warn, fail] = data.entries;
		expect(warn?.allow?.[0]?.runs[0]?.text).toBe(
			'// markless-allow MARKLESS_A_WARN: the reason you accept it',
		);
		expect(fail?.allow).toBeUndefined();
		expect(fail?.printed).toEqual(['MARKLESS_B_FAIL: b failed.']);
		expect(fail?.guide?.example[0]?.runs[0]?.text).toBe('retry();');
		expect(fail?.sources[0]?.url).toBe(
			'https://github.com/compiled-run/markless/blob/main/packages/web/src/b.ts',
		);
	});
});

describe('the committed error data', () => {
	// A child process, because shiki's wasm engine loads under Node but not under Vite's module runner.
	it('matches a fresh scan of packages/*/src, so a new or changed code fails here until it is regenerated', () => {
		const script = new URL('./errors.ts', import.meta.url).pathname;
		expect(execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' })).toContain(
			'error data is current',
		);
	}, 60_000);

	it('has a raised code behind every hand-written guide', () => {
		expect(orphanGuides(scanCodes(readSourceFiles()))).toEqual([]);
	});

	it('serves every code the diagnostics page links to', () => {
		const known = new Set(scanCodes(readSourceFiles()).map((entry) => entry.code));
		const page = readFileSync(
			new URL('../pages/tooling/diagnostics.mdx', import.meta.url),
			'utf8',
		);
		const linked = [...page.matchAll(/\(\/errors\/(MARKLESS_[A-Z0-9_]+)\)/g)].map((m) => m[1]);
		expect(linked.length).toBeGreaterThan(10);
		expect(linked.filter((code) => !known.has(code!))).toEqual([]);
	});
});
