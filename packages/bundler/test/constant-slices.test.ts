import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { expect, test } from 'vitest';
import { constantSliceId, narrowConstantImports } from '../src/constant-slices.ts';

const dir = mkdtempSync(join(tmpdir(), 'markless-constant-slices-'));
const dataFile = join(dir, 'drawing.ts');
writeFileSync(
	dataFile,
	`export const art = { shots: { boxes: [{ d: 'M0 0', length: 4 }] }, note: { file: { left: 3, right: 9 }, arrows: ['a'] }, views: [{ key: 'wide', ink: 'M1 1' }] };
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
