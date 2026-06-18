import { expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';

type Listener = {
	readonly type: string;
	readonly listener: (event: unknown) => unknown;
	readonly options?: unknown;
};

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	childNodes: FakeElement[];
	parentElement?: FakeElement | null;
	parentNode?: FakeElement | null;
	innerHTML: string;
	textContent?: string;
	listeners: Listener[];
	appendChild(child: FakeElement): FakeElement;
	replaceChildren(...children: FakeElement[]): void;
	removeChild(child: FakeElement): void;
	addEventListener(type: string, listener: (event: unknown) => unknown, options?: unknown): void;
};

function element(tagName: string): FakeElement {
	return {
		nodeType: 1,
		tagName: tagName.toUpperCase(),
		childNodes: [],
		innerHTML: '',
		listeners: [],
		appendChild(child) {
			child.parentElement = this;
			child.parentNode = this;
			this.childNodes.push(child);
			this.innerHTML = this.childNodes.map((node) => node.innerHTML).join('');
			return child;
		},
		replaceChildren(...children) {
			for (const child of this.childNodes) {
				child.parentElement = null;
				child.parentNode = null;
			}
			this.childNodes = [];
			this.innerHTML = '';
			for (const child of children) this.appendChild(child);
		},
		removeChild(child) {
			this.childNodes = this.childNodes.filter((node) => node !== child);
			child.parentElement = null;
			child.parentNode = null;
			this.innerHTML = this.childNodes.map((node) => node.innerHTML).join('');
		},
		addEventListener(type, listener, options) {
			this.listeners.push({ type, listener, options });
		},
	};
}

function documentLike() {
	const body = element('body');

	return {
		body,
		createElement(tagName: string) {
			const node = element(tagName);
			node.innerHTML = `<${tagName}></${tagName}>`;
			return node;
		},
		createRange() {
			return {
				createContextualFragment(html: string) {
					return { html };
				},
			};
		},
	};
}

test('render mounts client-render output into an owned browser test container', async () => {
	const document = documentLike();
	let runs = 0;

	const screen = await render(
		() => {
			runs++;
			const button = element('button');
			button.innerHTML = '<button>Count 0</button>';
			return { root: button };
		},
		{ document },
	);

	expect(runs).toBe(1);
	expect(screen.runtime.phase).toBe('client-render');
	expect(screen.baseElement).toBe(document.body);
	expect(document.body.childNodes).toEqual([screen.container]);
	expect(screen.container.childNodes).toEqual([screen.runtime.root]);
	expect(screen.asFragment()).toEqual({ html: '<button>Count 0</button>' });

	await cleanup();

	expect(document.body.childNodes).toEqual([]);
});

test('render cleanup clears but preserves caller-owned containers', async () => {
	const document = documentLike();
	const baseElement = element('section');
	const container = element('div');
	baseElement.appendChild(container);

	const screen = await render(
		() => {
			const span = element('span');
			span.innerHTML = '<span>hello</span>';
			return { root: span };
		},
		{ document, baseElement, container },
	);

	expect(screen.container).toBe(container);
	expect(container.childNodes).toEqual([screen.runtime.root]);

	screen.unmount();

	expect(baseElement.childNodes).toEqual([container]);
	expect(container.childNodes).toEqual([]);
});
