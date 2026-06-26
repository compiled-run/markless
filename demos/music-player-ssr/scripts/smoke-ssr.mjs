import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderToString } from 'arcade';

class TestText {
	nodeType = 3;
	parentElement = null;

	constructor(value) {
		this.value = decodeHtml(value);
	}

	get textContent() {
		return this.value;
	}

	set textContent(value) {
		this.value = String(value ?? '');
	}

	cloneNode() {
		return new TestText(this.value);
	}
}

class TestElement {
	nodeType = 1;
	childNodes = [];
	attributes = new Map();
	listeners = new Map();
	parentElement = null;
	style = {};

	constructor(tagName) {
		this.tagName = tagName;
	}

	get firstElementChild() {
		return this.childNodes.find((child) => child.nodeType === 1);
	}

	get textContent() {
		return this.childNodes.map((child) => child.textContent).join('');
	}

	set textContent(value) {
		this.replaceChildren(...(value ? [new TestText(String(value))] : []));
	}

	get className() {
		return this.attributes.get('class') ?? '';
	}

	set className(value) {
		this.setAttribute('class', value);
	}

	get value() {
		return this.attributes.get('value') ?? '';
	}

	set value(value) {
		this.setAttribute('value', String(value));
	}

	get max() {
		return this.attributes.get('max') ?? '';
	}

	set max(value) {
		this.setAttribute('max', String(value));
	}

	get alt() {
		return this.attributes.get('alt') ?? '';
	}

	set alt(value) {
		this.setAttribute('alt', String(value));
	}

	get src() {
		return this.attributes.get('src') ?? '';
	}

	set src(value) {
		this.setAttribute('src', String(value));
	}

	get dataset() {
		return new Proxy(
			{},
			{
				get: (_, key) => {
					if (typeof key !== 'string') return undefined;
					return this.attributes.get(`data-${kebab(key)}`);
				},
				set: (_, key, value) => {
					if (typeof key !== 'string') return false;
					this.setAttribute(`data-${kebab(key)}`, String(value));
					return true;
				},
			},
		);
	}

	appendChild(child) {
		child.parentElement?.removeChild(child);
		child.parentElement = this;
		this.childNodes.push(child);
		return child;
	}

	replaceChildren(...children) {
		for (const child of this.childNodes) child.parentElement = null;
		this.childNodes.length = 0;
		for (const child of children) this.appendChild(child);
	}

	removeChild(child) {
		const index = this.childNodes.indexOf(child);
		if (index >= 0) this.childNodes.splice(index, 1);
		child.parentElement = null;
		return child;
	}

	setAttribute(name, value) {
		this.attributes.set(name, decodeHtml(String(value)));
		notifyMutationObservers(this, name);
	}

	getAttribute(name) {
		return this.attributes.get(name);
	}

	removeAttribute(name) {
		this.attributes.delete(name);
		notifyMutationObservers(this, name);
	}

	querySelector(selector) {
		return querySelector(this, selector);
	}

	querySelectorAll(selector) {
		return querySelectorAll(this, selector);
	}

	addEventListener(type, listener) {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	closest(selector) {
		let node = this;
		while (node) {
			if (matches(node, selector)) return node;
			node = node.parentElement;
		}
		return null;
	}

	click() {
		void this.dispatch('click');
	}

	async dispatch(type, event = { type, target: this }) {
		for (const listener of this.listeners.get(type) ?? []) await listener(event);
		if (this.parentElement?.nodeType === 1) await this.parentElement.dispatch(type, event);
	}
}

const mutationObservers = [];
globalThis.MutationObserver = class {
	constructor(callback) {
		this.callback = callback;
	}

	observe(target, options = {}) {
		mutationObservers.push({ callback: this.callback, target, options });
	}
};

function notifyMutationObservers(target, attributeName) {
	for (const observer of mutationObservers) {
		if (observer.target !== target) continue;
		const filter = observer.options.attributeFilter;
		if (filter && !filter.includes(attributeName)) continue;
		observer.callback([{ type: 'attributes', target, attributeName }]);
	}
}

function parseHtml(html) {
	const root = new TestElement('#document');
	const stack = [root];
	const tokens = html.match(/<!doctype[^>]*>|<\/?[^>]+>|[^<]+/gi) ?? [];
	const voidTags = new Set([
		'area',
		'base',
		'br',
		'col',
		'embed',
		'hr',
		'img',
		'input',
		'link',
		'meta',
		'source',
		'track',
		'wbr',
	]);

	for (const token of tokens) {
		const parent = stack[stack.length - 1];
		if (!parent || token.toLowerCase().startsWith('<!doctype')) continue;
		if (token.startsWith('</')) {
			const closing = token.match(/^<\/([A-Za-z][\w-]*)>/);
			if (closing && stack[stack.length - 1]?.tagName === closing[1].toLowerCase()) {
				stack.pop();
			}
			continue;
		}
		if (token.startsWith('<')) {
			const match = token.match(/^<([A-Za-z][\w-]*)([^>]*)>/);
			if (!match) continue;
			const tagName = match[1].toLowerCase();
			const element = new TestElement(tagName);
			for (const attribute of match[2].matchAll(/\s+([^\s=/>]+)(?:="([^"]*)")?/g)) {
				element.setAttribute(attribute[1], attribute[2] ?? '');
			}
			parent.appendChild(element);
			if (!token.endsWith('/>') && !voidTags.has(tagName)) stack.push(element);
			continue;
		}
		if (token) parent.appendChild(new TestText(token));
	}

	return root;
}

function querySelector(root, selector) {
	return querySelectorAll(root, selector)[0] ?? null;
}

function querySelectorAll(root, selector) {
	const selectors = selector.trim().split(/\s+/);
	let current = [root];
	for (const part of selectors) {
		current = current.flatMap((node) =>
			descendants(node).filter((item) => matches(item, part)),
		);
	}
	return current;
}

function descendants(root) {
	const matches = [];
	const visit = (node) => {
		for (const child of node.childNodes ?? []) {
			if (child.nodeType === 1) {
				matches.push(child);
				visit(child);
			}
		}
	};
	visit(root);
	return matches;
}

function matches(node, selector) {
	const tagAttribute = selector.match(/^([A-Za-z][\w-]*)\[([^=\]]+)(?:="([^"]*)")?\]$/);
	if (tagAttribute) {
		return (
			node.tagName === tagAttribute[1].toLowerCase() &&
			matches(
				node,
				`[${tagAttribute[2]}${tagAttribute[3] === undefined ? '' : `="${tagAttribute[3]}"`}]`,
			)
		);
	}
	if (selector.startsWith('.')) {
		const className = selector.slice(1);
		return (node.getAttribute('class') ?? '').split(/\s+/).includes(className);
	}
	if (selector.startsWith('[')) {
		const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
		if (!attribute) return false;
		const value = node.getAttribute(attribute[1]);
		return attribute[2] === undefined ? value !== undefined : value === attribute[2];
	}
	if (selector.includes('.')) {
		const [tagName, className] = selector.split('.');
		return (
			node.tagName === tagName.toLowerCase() &&
			(node.getAttribute('class') ?? '').split(/\s+/).includes(className)
		);
	}
	return node.tagName === selector.toLowerCase();
}

function elementsByTag(root, tagName) {
	return descendants(root).filter((node) => node.tagName === tagName);
}

function byAriaLabel(root, label) {
	return elementsByTag(root, 'button').find(
		(button) => button.getAttribute('aria-label') === label,
	);
}

function librarySongButtons(root) {
	return elementsByTag(root, 'button').filter((button) =>
		(button.getAttribute('class') ?? '').startsWith('library-song'),
	);
}

function selectedLibraryNames(root) {
	return librarySongButtons(root)
		.filter((button) => (button.getAttribute('class') ?? '').includes('selected'))
		.map((button) => elementsByTag(button, 'h3')[0]?.textContent.trim() ?? '');
}

function assertEqual(actual, expected, message) {
	if (actual !== expected) {
		throw new Error(
			`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		);
	}
}

function assertIncludes(value, needle, message) {
	if (!value.includes(needle)) {
		throw new Error(`${message}: expected output to include ${JSON.stringify(needle)}`);
	}
}

function kebab(value) {
	return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function trace(message) {
	if (process.env.SMOKE_TRACE === '1') console.error(`[smoke] ${message}`);
}

function decodeHtml(value) {
	return value
		.replaceAll('&quot;', '"')
		.replaceAll('&gt;', '>')
		.replaceAll('&lt;', '<')
		.replaceAll('&amp;', '&');
}

async function readClientResumeModuleUrl(dist) {
	const buildDir = resolve(dist, 'build');
	for (const fileName of await readdir(buildDir)) {
		if (!fileName.endsWith('.js')) continue;

		const source = await readFile(resolve(buildDir, fileName), 'utf8');
		if (source.includes('resumeContainerEvent')) {
			return `/build/${fileName}`;
		}
	}
	throw new Error('Expected built client resume module exporting resumeContainerEvent.');
}

const rootDir = resolve(import.meta.dirname, '..');
const serverEntry = resolve(rootDir, 'dist/server/App.js');

if (!existsSync(serverEntry)) {
	throw new Error('Expected SSR build output at dist/server/App.js.');
}

const server = await import(`${pathToFileURL(serverEntry).href}?smoke=${Date.now()}`);
trace('server imported');
const resumeModuleUrl = await readClientResumeModuleUrl(resolve(rootDir, 'dist'));
const html = renderToString(server.default, { containerId: 'music-player-ssr', resumeModuleUrl });
trace('html rendered');

assertIncludes(html, 'data-async-container="music-player-ssr"', 'SSR container');
assertIncludes(html, 'data-async-resumer', 'inline event resumer');
assertIncludes(html, resumeModuleUrl, 'built resume module URL');
assertIncludes(html, 'Do I Clench My Fists? (Slowed + Reverb)', 'initial track title');
assertIncludes(html, 'class="youtube-frame-host"', 'YouTube host');
assertIncludes(html, 'class="library-song selected"', 'selected library item');
if (html.includes('/src/main.ts')) throw new Error('SSR HTML must not include the CSR main entry.');
if (html.includes('client-smoke')) throw new Error('SSR HTML must not include a client entry URL.');
if (html.includes(`entry-${'client'}`))
	throw new Error('SSR HTML must not reference a client entry.');
if (html.includes('<div id="root"></div>'))
	throw new Error('SSR HTML must not be a blank root shell.');
if (html.includes('arcade-if-start'))
	throw new Error('SSR HTML must not contain Arcade if markers.');

const documentRoot = parseHtml(html);
const container = documentRoot.querySelector('[data-async-container]');
if (!container) throw new Error('Parsed SSR HTML did not contain the Arcade container.');

const app = container.querySelector('.App');
const frame = container.querySelector('.youtube-frame-host');
const track = container.querySelector('.track');
const progressInput = container.querySelector('.progress-input');
const currentTime = container.querySelector('.time-current');
const duration = container.querySelector('.time-duration');
const animateTrack = container.querySelector('.animate-track');
const play = byAriaLabel(container, 'Play or pause');
const next = byAriaLabel(container, 'Next track');
const previous = byAriaLabel(container, 'Previous track');
const title = () => container.querySelector('.song-title')?.textContent ?? '';
const frameState = () => ({
	command: frame?.getAttribute('data-command'),
	commandVersion: frame?.getAttribute('data-command-version'),
	playing: frame?.getAttribute('data-playing'),
	videoId: frame?.getAttribute('data-video-id'),
});
const progressState = () => ({
	current: currentTime?.textContent,
	duration: duration?.textContent,
	inputMax: progressInput?.max,
	inputValue: progressInput?.value,
	mask: animateTrack?.style.transform,
	trackBg: track?.style.background,
	trackColors: [track?.getAttribute('data-color-start'), track?.getAttribute('data-color-end')],
});

trace('initial assertions start');
assertEqual(app?.getAttribute('class'), 'App', 'initial app class');
assertEqual(title(), 'Do I Clench My Fists? (Slowed + Reverb)', 'initial title');
assertEqual(frameState().videoId, 'DwTzcZxyUUg', 'initial YouTube video');
assertEqual(
	selectedLibraryNames(container).join(','),
	'Do I Clench My Fists? (Slowed + Reverb)',
	'initial selected library item',
);
assertEqual(play?.listeners.get('click')?.length ?? 0, 0, 'play direct listener count');
assertEqual(next?.listeners.get('click')?.length ?? 0, 0, 'next direct listener count');
assertEqual(previous?.listeners.get('click')?.length ?? 0, 0, 'previous direct listener count');
assertEqual(
	container.listeners.get('click')?.length ?? 0,
	0,
	'no app-owned delegated listener count',
);
assertEqual(librarySongButtons(container).length, 4, 'library song count');
trace('initial assertions complete');

console.log(
	JSON.stringify(
		{
			htmlBytes: html.length,
			title: title(),
			frame: frameState(),
			progress: progressState(),
			selected: selectedLibraryNames(container),
		},
		null,
		2,
	),
);
