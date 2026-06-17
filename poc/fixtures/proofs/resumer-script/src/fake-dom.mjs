export class FakeElement {
	constructor(tagName, attributes = {}, childNodes = []) {
		this.nodeType = 1;
		this.tagName = tagName.toUpperCase();
		this.attributes = new Map();
		this.childNodes = [];
		this.parentElement = null;
		this.listeners = [];
		this.textContent = '';

		for (const [name, value] of Object.entries(attributes)) {
			this.setAttribute(name, value);
		}
		for (const child of childNodes) {
			this.appendChild(child);
		}
	}

	appendChild(child) {
		this.childNodes.push(child);
		if (child.nodeType === 1) child.parentElement = this;
		return child;
	}

	setAttribute(name, value) {
		this.attributes.set(name, String(value));
	}

	getAttribute(name) {
		return this.attributes.get(name) ?? null;
	}

	hasAttribute(name) {
		return this.attributes.has(name);
	}

	querySelector(selector) {
		return walkElements(this).find((element) => matchesSelector(element, selector)) ?? null;
	}

	closest(selector) {
		for (let element = this; element; element = element.parentElement) {
			if (matchesSelector(element, selector)) return element;
		}
		return null;
	}

	addEventListener(type, listener, options) {
		this.listeners.push({ type, listener, options });
		globalThis.__resumerProof?.receipts.push({
			stage: 'listener-installed',
			eventName: type,
			capture: typeof options === 'object' ? options?.capture === true : Boolean(options),
		});
	}

	async dispatchEvent(event) {
		event.target = this;
		const root = rootOf(this);
		for (const entry of root.listeners.filter((listener) => listener.type === event.type)) {
			await entry.listener(event);
		}
	}
}

export class FakeDocument {
	constructor(root) {
		this.root = root;
		this.currentScript = null;
	}

	createTreeWalker(root, whatToShow) {
		if (whatToShow !== 1) {
			throw new Error('resumer-script proof only supports element TreeWalker records.');
		}
		const nodes = [];
		for (const child of root.childNodes) {
			if (child.nodeType === 1) {
				nodes.push(child, ...walkElements(child).filter((item) => item !== child));
			}
		}
		let index = 0;
		return {
			nextNode() {
				return nodes[index++] ?? null;
			},
		};
	}
}

export function createClickEvent() {
	return {
		type: 'click',
		target: null,
		defaultPrevented: false,
		propagationStopped: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this.propagationStopped = true;
		},
	};
}

function rootOf(element) {
	let root = element;
	while (root.parentElement) root = root.parentElement;
	return root;
}

function walkElements(root) {
	const nodes = [];
	const visit = (node) => {
		if (node.nodeType !== 1) return;
		nodes.push(node);
		for (const child of node.childNodes) visit(child);
	};
	visit(root);
	return nodes;
}

function matchesSelector(element, selector) {
	if (selector === '[data-async]') return element.hasAttribute('data-async');
	if (selector === 'script[type="arcade/view"]') {
		return element.tagName === 'SCRIPT' && element.getAttribute('type') === 'arcade/view';
	}
	return false;
}
