import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeHeard, heardKey, NOTHING } from './model.ts';

const page = readFileSync(new URL('../../../pages/concepts/events.mdx', import.meta.url), 'utf8');
const demo = readFileSync(new URL('./label-demo.tsrx', import.meta.url), 'utf8');

describe('the mug label demo', () => {
	it('says nothing before the first event, then what the handler got', () => {
		expect(describeHeard(NOTHING, 'nothing yet')).toBe('');
		expect(describeHeard(heardKey('Escape'), 'Ada')).toBe('Last event, keydown: event.key is "Escape". Printed: Ada.');
	});

	it('wires the same three handlers as the code on the page', () => {
		for (const handler of ['onInput', 'onKeyDown', 'onSubmit', 'event.preventDefault()', "event.key === 'Escape'"]) {
			expect(demo).toContain(handler);
			expect(page).toContain(handler);
		}
		expect(page).toContain('<LabelDemo />');
	});
});
