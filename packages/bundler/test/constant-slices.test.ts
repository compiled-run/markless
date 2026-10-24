import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { expect, test } from 'vitest';
import { constantSliceId, constantSlicesPlugin, narrowConstantImports } from '../src/constant-slices.ts';

const dir = mkdtempSync(join(tmpdir(), 'markless-constant-slices-'));
const dataFile = join(dir, 'drawing.ts');
writeFileSync(
	dataFile,
	`export const art = { shots: { boxes: [{ d: 'M0 0', length: 4 }] }, note: { file: { left: 3, right: 9 }, arrows: ['a'] }, views: [{ key: 'wide', ink: 'M1 1${' L2 2'.repeat(200)}' }] };
export function helper(value: number) { return value + 1; }
export const later = Date.now();
`,
);
const resolve = async (specifier: string) => (specifier === './drawing.ts' ? dataFile : null);

test('a module that reads slices of an imported constant imports those slices alone', async () => {
	const narrowed = await narrowConstantImports(
		`import { art, helper } from './drawing.ts';
export function symbol_0(context) { return helper(art.shots.boxes[context.at].length) + art.note.file.left + Object.keys(art.note.file).length; }`,
		resolve,
	);
	expect(narrowed?.files).toEqual([dataFile]);
	const code = narrowed!.code;
	expect(code).toContain(`import { helper } from "./drawing.ts";`);
	expect(code).toContain(JSON.stringify(constantSliceId(dataFile, 'art', ['shots', 'boxes'])));
	expect(code).toContain(JSON.stringify(constantSliceId(dataFile, 'art', ['note', 'file'])));
	expect(code).not.toContain(
		JSON.stringify(constantSliceId(dataFile, 'art', ['note', 'file', 'left'])),
	);
	expect(code).not.toContain(JSON.stringify(constantSliceId(dataFile, 'art', ['note'])));
	expect(code).not.toMatch(/\bart\./);
	expect(code).toMatch(/helper\(marklessConstantSlice\d\[context\.at\]\.length\)/);
});

test.each([
	['the whole value', `export const s = (c) => [art, c];`],
	['a write into it', `export const s = (c) => { art.note.file.left = c; };`],
	['a mutating call on a slice', `export const s = (c) => art.note.arrows.push(c);`],
	['a local of the same name', `export const s = (art) => art.views;`],
])('a constant read as %s stays whole', async (_label, body) => {
	expect(
		await narrowConstantImports(`import { art } from './drawing.ts';\n${body}`, resolve),
	).toBeNull();
});

test('an export that is not plain data, or a module that is not a script file, is left alone', async () => {
	expect(
		await narrowConstantImports(
			`import { later } from './drawing.ts';\nexport const s = () => later.valueOf();`,
			resolve,
		),
	).toBeNull();
	expect(
		await narrowConstantImports(
			`import { art } from './elsewhere.css';\nexport const s = () => art.views;`,
			resolve,
		),
	).toBeNull();
});

test('a slice bigger than the chunk size warning limit loads as its parts, each its own module', async () => {
	const bigFile = join(dir, 'big.ts');
	writeFileSync(
		bigFile,
		`export const art = { views: [{ ink: '${'a'.repeat(800)}' }, { ink: '${'b'.repeat(800)}' }], note: 'x' };\n`,
	);
	const plugin = constantSlicesPlugin();
	const load = (plugin.load as { handler: (id: string) => string }).handler;
	const context = {
		addWatchFile() {},
		environment: { config: { build: { chunkSizeWarningLimit: 1 } } },
	};
	const views = load.call(context, `\0${constantSliceId(bigFile, 'art', ['views'])}`);
	expect(views).toContain(JSON.stringify(constantSliceId(bigFile, 'art', ['views', 0])));
	expect(views).toContain(JSON.stringify(constantSliceId(bigFile, 'art', ['views', 1])));
	expect(views).toMatch(/export default \[marklessSlicePart0,marklessSlicePart1\];/);
	expect(load.call(context, `\0${constantSliceId(bigFile, 'art', ['views', 0])}`)).toBe(
		`export default ${JSON.stringify({ ink: 'a'.repeat(800) })};`,
	);
});

test('the full render data a client render loads is narrowed too', () => {
	const filter = (plugin: ReturnType<typeof constantSlicesPlugin>) =>
		(plugin.transform as { filter: { id: RegExp } }).filter.id;
	const id = filter(constantSlicesPlugin());
	expect(id.test('/app/components/figure.tsrx?markless-render-data')).toBe(true);
	expect(id.test('/app/components/figure.tsrx?markless-render-data&markless-served')).toBe(true);
	expect(id.test('/app/components/figure.tsrx?markless-symbols')).toBe(false);
});

test('a constant whose slices would ship more bytes than the whole value stays whole', async () => {
	const smallFile = join(dir, 'small.ts');
	writeFileSync(smallFile, `export const words = { a: 'x', b: 'y', c: 'z' };\n`);
	const narrowed = await narrowConstantImports(
		`import { words } from './small.ts';\nexport const s = () => words.a + words.b;`,
		async (specifier) => (specifier === './small.ts' ? smallFile : null),
	);
	expect(narrowed).toBeNull();
});

test('a constant too big for one chunk is sliced even when its slices cover all of it', async () => {
	const wholeFile = join(dir, 'whole.ts');
	writeFileSync(wholeFile, `export const art = { ink: '${'i'.repeat(600)}', views: ['${'v'.repeat(600)}'] };\n`);
	const read = `import { art } from './whole.ts';\nexport const s = () => [art.ink, art.views];`;
	const resolveWhole = async (specifier: string) => (specifier === './whole.ts' ? wholeFile : null);
	expect(await narrowConstantImports(read, resolveWhole)).toBeNull();
	expect((await narrowConstantImports(read, resolveWhole, 1000))?.code).toContain(
		JSON.stringify(constantSliceId(wholeFile, 'art', ['ink'])),
	);
});
