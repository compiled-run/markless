import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { Scopes } from './scopes.tsrx';

// Spec: core TSRX specification section 4.5 "Style Elements and Style Identifiers",
// https://tsrx.dev/specification (4.5.2 and 4.5.5), and the "Scoped styles" guide at
// https://tsrx.dev/features. `test.fails` marks a sentence Markless does not meet yet.
afterEach(() => cleanup());

type Mount = () => Promise<{ readonly container: ParentNode }>;

const scopes: ReadonlyArray<readonly [string, Mount]> = [
	['CSR', async () => render(Scopes)],
	['SSR', async () => renderSSR(Scopes)],
];

function element(container: ParentNode, marker: string): HTMLElement {
	const found = container.querySelector<HTMLElement>(`[data-${marker}]`);
	expect(found, `no [data-${marker}]`).not.toBeNull();
	return found!;
}

// The classes the compiler added: everything on the element beyond the classes written in the source.
function hashClasses(target: HTMLElement, authored: ReadonlyArray<string>): ReadonlyArray<string> {
	return Array.from(target.classList).filter((name) => !authored.includes(name));
}

for (const [mode, mount] of scopes) {
	test(`${mode}: a block styles its siblings and everything below them`, async () => {
		const { container } = await mount();
		expect(getComputedStyle(element(container, 'sib')).color).toBe('rgb(10, 20, 30)');
		expect(getComputedStyle(element(container, 'deep')).color).toBe('rgb(10, 20, 31)');
		expect(getComputedStyle(element(container, 'second')).color).toBe('rgb(40, 50, 60)');
	});

	test.fails(`${mode}: a block never styles the element that contains it`, async () => {
		const { container } = await mount();
		expect(getComputedStyle(element(container, 'host')).outlineStyle).toBe('none');
		expect(getComputedStyle(element(container, 'nest')).outlineStyle).toBe('none');
	});

	test(`${mode}: two blocks in one children list share one hash class`, async () => {
		const { container } = await mount();
		const first = hashClasses(element(container, 'sib'), ['sib']);
		expect(first).toHaveLength(1);
		expect(hashClasses(element(container, 'second'), ['second'])).toEqual(first);
	});

	test.fails(`${mode}: an element in a nested scope carries the outer hash class, then the inner one`, async () => {
		const { container } = await mount();
		const outer = hashClasses(element(container, 'sib'), ['sib']);
		const inner = hashClasses(element(container, 'inner'), ['inner']);
		expect(inner).toHaveLength(2);
		expect(inner[0]).toBe(outer[0]);
		expect(inner[1]).not.toBe(outer[0]);
	});

	test(`${mode}: outer rules reach into a nested scope`, async () => {
		const { container } = await mount();
		const inner = getComputedStyle(element(container, 'inner'));
		expect(inner.textDecorationLine).toBe('underline');
		expect(inner.color).toBe('rgb(70, 80, 90)');
	});

	test.fails(`${mode}: inner rules never reach out of their scope`, async () => {
		const { container } = await mount();
		expect(getComputedStyle(element(container, 'sib')).fontWeight).toBe('400');
	});

	test(`${mode}: a component in the same file with no block gets no hash class and no outer rule`, async () => {
		const { container } = await mount();
		const plain = element(container, 'plain');
		expect(hashClasses(plain, ['plain'])).toEqual([]);
		expect(getComputedStyle(plain).color).not.toBe('rgb(10, 20, 32)');
	});

	test(`${mode}: a component in the same file with its own block gets only its own rules`, async () => {
		const { container } = await mount();
		const styled = element(container, 'styled');
		const outer = hashClasses(element(container, 'sib'), ['sib']);
		const own = hashClasses(styled, ['styled', 'own']);
		expect(own).toHaveLength(1);
		expect(own).not.toEqual(outer);
		expect(getComputedStyle(styled).backgroundColor).toBe('rgb(1, 2, 3)');
		expect(getComputedStyle(styled).color).not.toBe('rgb(10, 20, 33)');
	});

	test(`${mode}: a component whose only block is self-closing gets no hash class`, async () => {
		const { container } = await mount();
		expect(hashClasses(element(container, 'bare'), ['bare'])).toEqual([]);
	});

	test(`${mode}: a component from another file gets none of the importer's rules`, async () => {
		const { container } = await mount();
		const other = element(container, 'other');
		const outer = hashClasses(element(container, 'sib'), ['sib']);
		expect(hashClasses(other, ['other'])).not.toContain(outer[0]);
		expect(getComputedStyle(other).color).not.toBe('rgb(10, 20, 34)');
	});

	// The bundler writes a module's own style import above its component imports, so the importer's sheet loads first.
	test.fails(`${mode}: a module's CSS is injected before the CSS of the module that imports it`, async () => {
		await mount();
		const marks = orderMarks();
		expect(marks).toContain('imported');
		expect(marks).toContain('importer');
		expect(marks.indexOf('imported')).toBeLessThan(marks.indexOf('importer'));
	});
}

// Each `--order-mark` value in document order, read from the CSS object model.
function orderMarks(): ReadonlyArray<string> {
	const marks: string[] = [];
	const visit = (rules: CSSRuleList): void => {
		for (const rule of Array.from(rules)) {
			if (rule instanceof CSSStyleRule) {
				const mark = rule.style.getPropertyValue('--order-mark').trim();
				if (mark) marks.push(mark);
			}
			if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
		}
	};
	for (const sheet of Array.from(document.styleSheets)) {
		try {
			visit(sheet.cssRules);
		} catch {
			// A cross-origin sheet hides its rules; none of ours is one.
		}
	}
	return marks;
}
