import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import ts from 'typescript';
import { createQuickInfoService } from './twoslash-quickinfo.ts';

const fences = (file: string) =>
	[
		...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(
			/^```tsrx\n([\s\S]*?)^```/gm,
		),
	].map((match) => match[1]!.replace(/\n+$/, ''));
const counter = fences('../pages/markless/concepts/state.mdx').find((text) =>
	text.includes('function Counter()'),
)!;
const gridlist = fences('../pages/markless/ui/gridlist.mdx');
const files = gridlist.find((text) => text.includes('function Files()'))!;
const multiple = gridlist.find((text) => text.startsWith('<gridlist.root multiple'))!;
const wrap = gridlist.find((text) => text.startsWith('<gridlist.root wrap'))!;

test.each([counter, files])(
	'incomplete fences do not reuse the preceding document: %s',
	(prior) => {
		const service = createQuickInfoService();
		expect(service.queryFence(prior, 'tsrx').length).toBeGreaterThan(0);
		const first = service.queryFence(multiple, 'tsrx');
		expect(first).toEqual([]);
		expect(service.queryFence(wrap, 'tsrx')).toEqual([]);
		expect(service.queryFence(multiple, 'tsrx')).toBe(first);
	},
);

test('different incomplete tags and two callers keep their own fence results', () => {
	const first = createQuickInfoService(),
		second = createQuickInfoService();
	const source = `import { state as cell } from '@markless/core';
export default function Thermometer() @{
 let temperature=cell(23);
 <output>{temperature}</output>
}`;
	const expected = first.queryFence(source, 'tsrx');
	expect(expected.some((info) => info.signature.includes('Thermometer'))).toBe(true);
	expect(second.queryFence('<weather.reading degrees={temperature}>', 'tsrx')).toEqual([]);
	expect(first.queryFence(source, 'tsrx')).toEqual(expected);
	expect(second.queryFence(source, 'tsrx')).toEqual(expected);
});

test('valid imported property documentation and source spans remain available', () => {
	const service = createQuickInfoService();
	const infos = service.queryFence(files, 'tsrx');
	const info = infos.find(
		(entry) => files.slice(entry.start, entry.start + entry.length) === 'multiple',
	);
	expect(info?.signature).toContain('boolean');
	expect(info?.doc).toBe(
		'Several rows can be picked at once. Writing it also makes the list selectable.',
	);
	for (const entry of infos) {
		expect(entry.start).toBeGreaterThanOrEqual(0);
		expect(entry.start + entry.length).toBeLessThanOrEqual(files.length);
	}
	expect(service.queryFence('unknownIdentifier;', 'unsupported')).toEqual([]);
});

test('a previous synthetic root cannot supply a global to another fence', () => {
	const first = createQuickInfoService(),
		second = createQuickInfoService();
	first.queryFence('const priorFenceOnly = 73;', 'tsrx');
	const infos = second.queryFence('priorFenceOnly;', 'tsrx');
	expect(infos.some((info) => info.signature.includes('73'))).toBe(false);
	expect(infos.some((info) => info.signature.includes('const priorFenceOnly'))).toBe(false);
});

test('explicit global declarations remain isolated to their fence', () => {
	const service = createQuickInfoService();
	const original = service.queryFence(
		'export {}; declare global { var declaredFenceValue: "fence-only"; } declaredFenceValue;',
		'tsrx',
	);
	expect(original.some((info) => info.signature.includes('fence-only'))).toBe(true);
	const next = service.queryFence('declaredFenceValue;', 'tsrx');
	expect(next.some((info) => info.signature.includes('fence-only'))).toBe(false);
});

test('switching fences retains parsed imported type documents', () => {
	const timing = (
		ts as typeof ts & {
			performance: {
				enable(): void;
				disable(): void;
				getCount(mark: string): number;
			};
		}
	).performance;
	const service = createQuickInfoService();
	timing.enable();
	try {
		service.queryFence(
			"import { state } from '@markless/core';\nexport const score = state(2);",
			'tsrx',
		);
		service.queryFence('const unrelatedValue = 10;', 'tsrx');
		const before = timing.getCount('beforeParse');
		const infos = service.queryFence(
			"import { state } from '@markless/core';\nexport const temperature = state(3);",
			'tsrx',
		);
		expect(infos.some((info) => info.signature.includes('temperature'))).toBe(true);
		expect(timing.getCount('beforeParse') - before).toBeLessThan(10);
	} finally {
		timing.disable();
	}
});
