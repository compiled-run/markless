import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeChange, nextName, START } from './idcard-model.ts';
import { drawing } from './idcard.ts';

const cardArt = drawing();
const piece = readFileSync(new URL('./idcard-anatomy.tsrx', import.meta.url), 'utf8');

describe('an ID card wired field by field', () => {
	it('keeps one person and names each change', () => {
		expect(START).toEqual({ name: 'Jack', age: 24 });
		expect(nextName('Jack')).toBe('Ada');
		expect(nextName('Alan')).toBe('Jack');
		expect(describeChange('age', 25)).toBe('person.age is now 25. Only the age wire carried it; the name spot stayed as it was.');
	});

	it('changes the object field by field, as the page teaches', () => {
		expect(piece).toContain('person.age++;');
		expect(piece).toContain('person.name = nextName(person.name);');
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws one wire per field, the same every time', () => {
		expect(Object.keys(cardArt.wires)).toEqual(['name', 'age']);
		expect(cardArt.card.fields).toHaveLength(2);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(cardArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by idcard.test.ts from idcard.ts. Run the figure tests with -u to refresh.
import type { drawing } from './idcard.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(cardArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./idcard.art.ts');
	});
});
