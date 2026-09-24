import { expect, test, vi } from 'vitest';

const parses = vi.hoisted(() => ({ count: 0, records: 0 }));
vi.mock('@markless/compiler', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@markless/compiler')>();
	return {
		...actual,
		parseJavaScriptModule: (...args: Parameters<typeof actual.parseJavaScriptModule>) => {
			parses.count++;
			return actual.parseJavaScriptModule(...args);
		},
	};
});

vi.mock('rolldown/experimental', async (importOriginal) => {
	const actual = await importOriginal<typeof import('rolldown/experimental')>();
	return {
		...actual,
		parseSync: (...args: Parameters<typeof actual.parseSync>) => {
			parses.records++;
			return actual.parseSync(...args);
		},
	};
});

const { factorRenderDataLiterals } = await import('../src/render-data-literals.ts');
const { moduleSpecifiers } = await import('../src/hooks/transform-emit.ts');

test.each([
	['{state:{a:[1,2,3]},view:{b:{c:1}}}', 'marker'],
	['{view:{rows:["x","y"]},state:{open:true}}', 'panel'],
])('literal factoring of one input runs once and hands out independent copies', (record, name) => {
	const records = [record, record, `{state:{${name}:1}}`];
	const declarations = `const ${name} = 1;`;
	const before = parses.count;
	const first = factorRenderDataLiterals(records, declarations);
	const parsed = parses.count - before;
	first.records.push('mutated');
	first.factories.push('mutated');
	const second = factorRenderDataLiterals(records, declarations);

	expect(parsed).toBeGreaterThan(0);
	expect(parses.count - before).toBe(parsed);
	expect(second.records).toHaveLength(records.length);
	expect(second.factories).not.toContain('mutated');
	expect(second.records).toEqual(first.records.slice(0, records.length));
});

test.each([
	[`import "a";\nexport { x } from "b";\nexport * from "c";\nconst y = 1;`, ['a', 'b', 'c']],
	[`export const z = 2;\nimport { q } from "d";`, ['d']],
])('module specifier scan parses one text once', (code, expected) => {
	const before = parses.records;
	expect(moduleSpecifiers(code)).toEqual(expected);
	expect(moduleSpecifiers(code)).toEqual(expected);
	expect(parses.records - before).toBe(1);
});
