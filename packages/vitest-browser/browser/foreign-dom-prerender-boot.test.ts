import { afterEach, expect, test } from 'vitest';
import { PROTOCOL_LOCATOR_PATHS_ATTRIBUTE } from '../../serializer/src/protocol-locator-paths.ts';
import {
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
} from '../../serializer/src/protocol-page-markers.ts';
import { marklessRepairCensus } from '../../web/src/fns/served-census-repair.ts';
import { createPrerenderInlineResumerSource } from '../../web/src/inline/resumer.ts';
import { servedLocatorPaths } from '../../web/src/locator-paths.ts';

type Root = HTMLElement & { __marklessCensus?: Array<Element | null>; __marklessShifted?: number };
type Forwarded = { readonly root: Root; readonly element: Element; readonly eventRecord: unknown };

const witness = globalThis as { __prerenderBootWitness?: (input: Forwarded) => void };
afterEach(() => {
	document.body.replaceChildren();
	delete witness.__prerenderBootWitness;
});

const inner =
	'<header><div data-slot><button>Search</button></div><a href="/">Home</a></header>' +
	'<main><p data-owned>0</p><button data-bump>Bump</button></main>';
const resumeModule = `data:text/javascript,${encodeURIComponent(
	'export function resumeContainerEvent(input) { globalThis.__prerenderBootWitness(input); }',
)}`;

function served(): Root {
	const root = document.createElement('div') as Root;
	root.setAttribute('data-async-container', '');
	// DOM order: 0 container, 1 header, 2 div, 3 button, 4 a, 5 main, 6 p, 7 button, 8 the boot script.
	const paths = servedLocatorPaths(`${inner}<script></script>`, [{ index: 6 }, { index: 7 }])!;
	root.setAttribute(PROTOCOL_LOCATOR_PATHS_ATTRIBUTE, paths);
	root.innerHTML = inner;
	document.body.append(root);
	return root;
}

function boot(root: Root): Promise<Forwarded> {
	const forwarded = new Promise<Forwarded>((resolve) => {
		witness.__prerenderBootWitness = (input) => {
			if (input.root.__marklessShifted) marklessRepairCensus(input.root);
			resolve(input);
		};
	});
	const script = document.createElement('script');
	script.textContent = createPrerenderInlineResumerSource(['click'], resumeModule);
	root.append(script);
	return forwarded;
}

test('the prerender boot flags a page a script changed first, and resume renumbers it by served parent', async () => {
	const root = served();
	const search = document.createElement('button');
	search.innerHTML = '<span><svg><path></path></svg><span>Search</span></span>';
	root.querySelector('[data-slot]')!.replaceChildren(search);
	root.querySelector('header')!.prepend(document.createElement('span'));
	const forwarded = boot(root);
	root.querySelector<HTMLButtonElement>('[data-bump]')!.click();
	const input = await forwarded;

	expect(input.eventRecord).toBeNull();
	expect(input.element).toBe(root.querySelector('[data-bump]'));
	expect(root.__marklessShifted).toBe(0);
	expect(root.__marklessCensus![6]).toBe(root.querySelector('[data-owned]'));
	expect(root.__marklessCensus![7]).toBe(root.querySelector('[data-bump]'));
});

test('an unchanged page keeps the census it walked and is never flagged', async () => {
	const root = served();
	const forwarded = boot(root);
	root.querySelector<HTMLButtonElement>('[data-bump]')!.click();
	await forwarded;

	expect(root.__marklessShifted).toBeUndefined();
	expect(root.__marklessCensus).toEqual([root, ...root.querySelectorAll('*')]);
});

// An author's element as the container: the document's own nodes sit outside the page's markers.
function servedBetweenDocumentContent(): Root {
	const root = served();
	const site = document.createElement('main');
	site.setAttribute('data-site', '');
	root.prepend(site, document.createComment(PROTOCOL_CONTAINER_START_COMMENT));
	return root;
}

function closePage(root: Root): void {
	const footer = document.createElement('footer');
	root.append(document.createComment(PROTOCOL_CONTAINER_END_COMMENT), footer);
}

test('document content around the page is left out of the census and its served count', async () => {
	const root = servedBetweenDocumentContent();
	const forwarded = boot(root);
	closePage(root);
	root.querySelector<HTMLButtonElement>('[data-bump]')!.click();
	await forwarded;

	expect(root.__marklessShifted).toBeUndefined();
	expect(root.__marklessCensus![5]).toBe(root.querySelector('main:not([data-site])'));
	expect(root.__marklessCensus![7]).toBe(root.querySelector('[data-bump]'));
	expect(root.__marklessCensus).not.toContain(root.querySelector('[data-site]'));
	expect(root.__marklessCensus).not.toContain(root.querySelector('footer'));
});

test('resume renumbers a changed page by its own children, never the document element before it', async () => {
	const root = servedBetweenDocumentContent();
	root.querySelector('header')!.after(document.createElement('div'));
	const forwarded = boot(root);
	closePage(root);
	root.querySelector<HTMLButtonElement>('[data-bump]')!.click();
	await forwarded;

	expect(root.__marklessShifted).toBe(0);
	expect(root.__marklessCensus![6]).toBe(root.querySelector('[data-owned]'));
	expect(root.__marklessCensus![7]).toBe(root.querySelector('[data-bump]'));
});
