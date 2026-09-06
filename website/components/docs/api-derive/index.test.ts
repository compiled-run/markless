import { describe, expect, it } from 'vitest';
import { apiSections, partsOf } from './index.ts';

describe('apiSections', () => {
	it('follows the given part order and names each section the way a consumer writes it', () => {
		const sections = apiSections('accordion', [
			'root',
			'item',
			'itemlabel',
			'itemtrigger',
			'itemcontent',
		]);
		expect(sections.map((section) => section.name)).toEqual([
			'accordion.root',
			'accordion.item',
			'accordion.itemlabel',
			'accordion.itemtrigger',
			'accordion.itemcontent',
		]);
		expect(sections.map((section) => section.id)).toEqual([
			'accordion-root',
			'accordion-item',
			'accordion-itemlabel',
			'accordion-itemtrigger',
			'accordion-itemcontent',
		]);
	});

	it('falls back to root-first alphabetical order and covers every part the manifest carries', () => {
		const sections = apiSections('accordion');
		expect(sections.map((section) => section.name.slice('accordion.'.length))).toEqual(
			partsOf('accordion').map((part) => part.part),
		);
		expect(sections[0]?.name).toBe('accordion.root');
	});

	it('keeps a part with no props of its own as an empty section', () => {
		const content = apiSections('accordion').find(
			(section) => section.name === 'accordion.itemcontent',
		);
		expect(content?.rows).toEqual([]);
	});
});
