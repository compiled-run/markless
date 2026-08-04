import { afterEach, expect, test } from 'vitest';
import { PROTOCOL_EVENT_ACTION_KIND } from '@markless/web/fns/external-delegate';
import { Link } from '../src/index.ts';

const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

afterEach(() => {
	if (documentDescriptor) {
		Object.defineProperty(globalThis, 'document', documentDescriptor);
		return;
	}

	delete (globalThis as { document?: unknown }).document;
});

test('Link renders router anchors while preserving user attributes', () => {
	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: {
			createElement(tagName: string) {
				return new FakeElement(tagName);
			},
		},
	});

	const props = {
		href: '/docs/getting-started',
		children: 'Docs <strong>now</strong>',
		class: 'nav-link',
		target: '_self',
		rel: 'author',
		'aria-current': 'page',
		'data-testid': 'docs-link',
		download: true,
		disabled: false,
		onClick: () => undefined,
		params: { slug: ['getting-started'] },
		prefetch: 'intent',
		replace: true,
		scroll: false,
	};
	const output = Link.renderCsr(props);
	const root = output.root as unknown as FakeElement;

	expect(root.tagName).toBe('a');
	expect(root.getAttribute('href')).toBe('/docs/getting-started');
	expect(root.hasAttribute('data-markless-router-link')).toBe(true);
	expect(root.getAttribute('class')).toBe('nav-link');
	expect(root.getAttribute('target')).toBe('_self');
	expect(root.getAttribute('rel')).toBe('author');
	expect(root.getAttribute('aria-current')).toBe('page');
	expect(root.getAttribute('data-testid')).toBe('docs-link');
	expect(root.getAttribute('download')).toBe('');
	expect(root.hasAttribute('data-markless-router-replace')).toBe(true);
	expect(root.getAttribute('data-markless-router-scroll')).toBe('manual');
	expect(root.hasAttribute('disabled')).toBe(false);
	expect(root.hasAttribute('onClick')).toBe(false);
	expect(root.hasAttribute('params')).toBe(false);
	expect(root.hasAttribute('prefetch')).toBe(false);
	expect(root.innerHTML).toBe('Docs <strong>now</strong>');
	expect(output.view).toMatchObject({
		locators: [expect.objectContaining({ hostNodeId: 'router:link', index: 0 })],
		events: [
			{
				hostNodeId: 'router:link',
				eventName: 'click',
				symbolIds: [],
				action: {
					kind: PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
					owner: 'router',
				},
			},
		],
	});

	const ssrOutput = Link.renderSsr(props);
	const ssr = ssrOutput.html;

	expect(ssr).toContain('href="/docs/getting-started"');
	expect(ssr).toContain('data-markless-router-link');
	expect(ssr).toContain('class="nav-link"');
	expect(ssr).toContain('aria-current="page"');
	expect(ssr).toContain('data-testid="docs-link"');
	expect(ssr).toContain('download');
	expect(ssr).toContain('data-markless-router-replace');
	expect(ssr).toContain('data-markless-router-scroll="manual"');
	expect(ssr).toContain('>Docs <strong>now</strong></a>');
	expect(ssr).not.toContain('params=');
	expect(ssr).not.toContain('prefetch=');
	expect(ssr).not.toContain('onClick=');
	expect(ssrOutput.view).toEqual(output.view);
	expect(ssrOutput.structureTokens).toEqual([
		{ kind: 'element', hostNodeId: 'router:link', tagName: 'a' },
	]);
});

test('Link prefixes its SSR structure token for parent composition', () => {
	const output = Link.renderSsr({ href: '/docs', children: 'Docs' }, { idPrefix: 'c0:' });

	expect(output.structureTokens).toEqual([
		{ kind: 'element', hostNodeId: 'c0:router:link', tagName: 'a' },
	]);
});

class FakeElement {
	readonly attributes = new Map<string, string>();
	innerHTML = '';

	constructor(readonly tagName: string) {}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	hasAttribute(name: string): boolean {
		return this.attributes.has(name);
	}
}
