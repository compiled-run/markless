import { afterAll, beforeAll, expect, test } from 'vitest';
import {
	KEEP_ATTRIBUTE,
	KEEP_CHILDREN,
	KEEP_END,
	KEEP_PARTS_HOOK,
	KEEP_SPAN,
	KEEP_TEXT,
	KEEP_VALUE,
	type KeepParts,
} from '../src/fns/keep-parts-hook.ts';
import {
	installKeepParts,
	PROTOCOL_ISLANDS_ATTRIBUTE,
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_KEEP_SHARED_PREFIX,
	PROTOCOL_OWN_ATTRIBUTE,
} from '../src/fns/keep-parts.ts';

const hooks = globalThis as { [KEEP_PARTS_HOOK]?: KeepParts };
let keep!: KeepParts;
beforeAll(() => {
	installKeepParts(new Set(['components/trail.tsrx']));
	keep = hooks[KEEP_PARTS_HOOK]!;
});
afterAll(() => {
	delete hooks[KEEP_PARTS_HOOK];
});

const filler = `<p class="filler">${'Every page repeats this long line. '.repeat(20)}</p>`;
const presentational = (masked: string, module = 'components/trail.tsrx') => ({
	view: {},
	structure: { keepMasked: masked, keepModule: module },
});
const value = (name: string, html: string) => `${KEEP_VALUE}${name}${KEEP_SPAN}${html}${KEEP_END}`;
const attribute = (name: string, html: string) =>
	`${KEEP_ATTRIBUTE}${name}${KEEP_SPAN}${html}${KEEP_END}`;

// A trail whose link for the current page carries aria-current, and whose title is an attribute value.
function trail(current: 'a' | 'b', children: string) {
	const ariaA = current === 'a' ? ' aria-current="page"' : '';
	const ariaB = current === 'b' ? ' aria-current="page"' : '';
	const title = current === 'a' ? 'Alpha &amp; co' : 'Beta';
	return {
		html: `<nav title="${title}"><a href="/a"${ariaA}>A</a><a href="/b"${ariaB}>B</a>${filler}<div class="body">${children}</div></nav>`,
		masked: `<nav title="${value('title', title)}"><a href="/a"${attribute('aria-current', ariaA)}>A</a><a href="/b"${attribute('aria-current', ariaB)}>B</a>${filler}<div class="body">${KEEP_CHILDREN}</div></nav>`,
	};
}

const mark = (html: string, name: string) =>
	new RegExp(` ${name}="([^"]*)"`).exec(html)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('two pages that differ only in attribute slot values render one shared hash, and each lists its values', () => {
	const alpha = trail('a', '<h1>Alpha</h1>');
	const beta = trail('b', '<h1>Beta</h1><p>more</p>');
	const one = keep(alpha.html, '<h1>Alpha</h1>', presentational(alpha.masked));
	const two = keep(beta.html, '<h1>Beta</h1><p>more</p>', presentational(beta.masked));
	const hash = mark(one, PROTOCOL_KEEP_ATTRIBUTE)!;
	expect(hash.startsWith(PROTOCOL_KEEP_SHARED_PREFIX)).toBe(true);
	expect(mark(two, PROTOCOL_KEEP_ATTRIBUTE)).toBe(hash);
	expect(JSON.parse(mark(one, PROTOCOL_ISLANDS_ATTRIBUTE)!)).toEqual([
		[0, 'title', 'Alpha & co'],
		[1, 'aria-current', 'page'],
		[2, 'aria-current', null],
	]);
	expect(JSON.parse(mark(two, PROTOCOL_ISLANDS_ATTRIBUTE)!)).toEqual([
		[0, 'title', 'Beta'],
		[1, 'aria-current', null],
		[2, 'aria-current', 'page'],
	]);
	expect(two).toContain(`<div class="body" ${PROTOCOL_OWN_ATTRIBUTE}><h1>Beta</h1><p>more</p></div>`);
});

test('a part whose markup differs outside its attribute slots renders another hash', () => {
	const alpha = trail('a', 'x');
	const changed = {
		html: alpha.html.replace('>A<', '>Alpha<'),
		masked: alpha.masked.replace('>A<', '>Alpha<'),
	};
	expect(mark(keep(changed.html, 'x', presentational(changed.masked)), PROTOCOL_KEEP_ATTRIBUTE)).not.toBe(
		mark(keep(alpha.html, 'x', presentational(alpha.masked)), PROTOCOL_KEEP_ATTRIBUTE),
	);
});

test('a part with a text slot is kept while byte for byte equal but never shared', () => {
	const html = `<header><span>Alpha</span>${filler}</header>`;
	const masked = `<header><span>${KEEP_TEXT}Alpha</span>${filler}</header>`;
	const hash = mark(keep(html, undefined, presentational(masked)), PROTOCOL_KEEP_ATTRIBUTE)!;
	expect(hash).toBeTruthy();
	expect(hash.startsWith(PROTOCOL_KEEP_SHARED_PREFIX)).toBe(false);
});

test('a part whose children the masked markup cannot place is kept only while byte for byte equal', () => {
	const alpha = trail('a', '<h1>Alpha</h1>');
	// The masked markup holds a children slot inside another element than the one the html places them in.
	const moved = alpha.masked.replace(`<div class="body">${KEEP_CHILDREN}</div>`, `<div class="body"><i>${KEEP_CHILDREN}</i></div>`);
	const out = keep(alpha.html, '<h1>Alpha</h1>', presentational(moved));
	expect(mark(out, PROTOCOL_KEEP_ATTRIBUTE)!.startsWith(PROTOCOL_KEEP_SHARED_PREFIX)).toBe(false);
	expect(out).not.toContain(PROTOCOL_ISLANDS_ATTRIBUTE);
});

test('a part from a module only one route renders is kept but never shared', () => {
	const alpha = trail('a', 'x');
	const hash = mark(
		keep(alpha.html, 'x', presentational(alpha.masked, 'components/generated/intro.tsrx')),
		PROTOCOL_KEEP_ATTRIBUTE,
	)!;
	expect(hash).toBe(
		mark(keep(alpha.html, 'x', presentational(alpha.masked)), PROTOCOL_KEEP_ATTRIBUTE)!.slice(
			PROTOCOL_KEEP_SHARED_PREFIX.length,
		),
	);
});

test('a part with more than one root, or a template, is kept only while byte for byte equal', () => {
	const two = `<link rel="preload" href="/layer.html"><div class="layer">${filler}</div>`;
	const twoMasked = `<link rel="preload" href="${value('href', '/layer.html')}"><div class="layer">${filler}</div>`;
	const held = `<div class="holder"><template><p title="x">${filler}</p></template></div>`;
	const heldMasked = `<div class="holder"><template><p title="${value('title', 'x')}">${filler}</p></template></div>`;
	for (const [html, masked] of [
		[two, twoMasked],
		[held, heldMasked],
	] as const) {
		const out = keep(html, undefined, presentational(masked));
		expect(mark(out, PROTOCOL_KEEP_ATTRIBUTE)!.startsWith(PROTOCOL_KEEP_SHARED_PREFIX)).toBe(false);
		expect(out).not.toContain(PROTOCOL_ISLANDS_ATTRIBUTE);
	}
});
