import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, expect, test } from 'vitest';
import ts from 'typescript';
import { HTML_ELEMENTS, SVG_ELEMENTS } from './html-elements.ts';
import { createQuickInfoService, readableSignature } from './twoslash-quickinfo.ts';

const fences = (file: string) =>
	[
		...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(
			/^```tsrx\n([\s\S]*?)^```/gm,
		),
	].map((match) => match[1]!.replace(/\n+$/, ''));
const cups = fences('./fixtures/state-cups.mdx').find((text) => text.includes('function Cups()'))!;
const gridlist = fences('./fixtures/gridlist.mdx');
const files = gridlist.find((text) => text.includes('function Files()'))!;
const multiple = gridlist.find((text) => text.startsWith('<gridlist.root multiple'))!;
const wrap = gridlist.find((text) => text.startsWith('<gridlist.root wrap'))!;

// The language service is shared and loads each package's types once (4.3 s on an M-series laptop, past 5 s inside one test on a CI runner): pay that here.
beforeAll(() => {
	createQuickInfoService().queryFence(
		"import { state } from '@markless/core';\nimport { gridlist } from '@markless/ui';\nexport const warm = [state, gridlist];",
		'tsrx',
	);
}, 60_000);

test.each([cups, files])('incomplete fences do not reuse the preceding document: %s', (prior) => {
	const service = createQuickInfoService();
	expect(service.queryFence(prior, 'tsrx').length).toBeGreaterThan(0);
	const first = service.queryFence(multiple, 'tsrx');
	expect(first).toEqual([]);
	expect(service.queryFence(wrap, 'tsrx')).toEqual([]);
	expect(service.queryFence(multiple, 'tsrx')).toBe(first);
});

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

const OPENERS: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

/** Every bracket closes, and the line does not stop on something that needs more after it. */
function isWholeType(signature: string): boolean {
	const open: string[] = [];
	for (const char of signature.replaceAll('=>', '')) {
		if (char === '(' || char === '[' || char === '{') open.push(char);
		else if (char in OPENERS && open.pop() !== OPENERS[char]) return false;
	}
	return open.length === 0 && !/[{<(&|,]$/.test(signature.trimEnd());
}

const elements = `import { state } from '@markless/core';

export default function Visitor() @{
	let user = state({ name: 'Ada', visits: 0, address: { street: 'Main', city: 'Bath' } });

	<section>
		<p>{user.name}</p>
		<button onClick={(event) => user.visits++}>Visits: {user.visits}</button>
		<input onInput={(event) => (user.name = event.currentTarget.value)} />
		<svg viewBox="0 0 4 4"><circle r="2" /><clipPath id="c" /></svg>
	</section>
}`;

test('every hover is a whole type, and a tag hover names the element instead of its attribute type', () => {
	const infos = createQuickInfoService().queryFence(elements, 'tsrx');
	const byText = (text: string) =>
		infos.filter((info) => elements.slice(info.start, info.start + info.length) === text);
	for (const info of infos) expect(isWholeType(info.signature), info.signature).toBe(true);
	expect(byText('section')[0]).toMatchObject({
		signature: '<section> · HTML element',
		doc: HTML_ELEMENTS.section,
	});
	expect(byText('button').map((info) => info.signature)).toEqual([
		'<button> · HTML element',
		'<button> · HTML element',
	]);
	expect(byText('circle')[0]?.signature).toBe('<circle> · SVG element');
	expect(byText('clipPath')[0]?.doc).toBe(SVG_ELEMENTS.clipPath);
	expect(byText('user')[0]?.signature).toMatch(/^let user: \{ .* \}$/);
	expect(byText('state')[0]?.signature).toBe('(alias) function state<T>(initial: T): T');
});

test('a long type folds its largest object body and stays whole', () => {
	const long = `let user: { name: string; visits: number; address: { street: string; city: string; postcode: string; country: string; }; }`;
	const folded = readableSignature(long);
	expect(folded.length).toBeLessThan(long.length);
	expect(isWholeType(folded)).toBe(true);
	expect(folded).toContain('{ … }');
	expect(readableSignature('let count: number')).toBe('let count: number');
});

test('every tag written in a site code sample has an element line', () => {
	const pages = readdirSync(new URL('../pages/', import.meta.url), { recursive: true })
		.filter((file) => String(file).endsWith('.mdx'))
		.map((file) => readFileSync(new URL(`../pages/${String(file)}`, import.meta.url), 'utf8'));
	const known = { ...HTML_ELEMENTS, ...SVG_ELEMENTS } as Readonly<Record<string, string>>;
	for (const page of pages)
		for (const fence of page.matchAll(/^```tsrx[^\n]*\n([\s\S]*?)^```/gm))
			for (const tag of fence[1]!.matchAll(/<\/?([a-z][A-Za-z0-9]*)(?![\w.-])/g))
				expect(known, tag[1]).toHaveProperty(tag[1]!);
});
