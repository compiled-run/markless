import { expect } from 'vitest';
import { quotes, type Quote } from './quote-source.ts';

export const poll = { timeout: 5_000, interval: 10 };
export const SCOPE = 'data-markless-scope';
export const SEEDED = 'data-markless-seeded';
const REGION = '[data-markless-announcer]';

export function resetQuotes(answer: (id: number) => Promise<Quote> = async (id) => ({ text: `quote ${id}` })) {
	quotes.runs = 0;
	quotes.answer = answer;
}

export function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

// The resume cache's entries in this tab; the bare prefix key is its write order, not an entry.
export function entries(): string[] {
	return Object.keys(sessionStorage).filter((key) => key.startsWith('markless:resume:'));
}

// Every element that showed a @pending arm while the test watched, in any frame or mutation.
export function watchPending(selector = '[data-pending]') {
	const seen: string[] = [];
	const look = (node: Node) => {
		const element = node as Element;
		if (element.nodeType !== 1) return;
		if (element.matches(selector) || element.querySelector(selector)) seen.push(element.outerHTML);
	};
	const observer = new MutationObserver((records) => {
		for (const record of records) record.addedNodes.forEach(look);
	});
	observer.observe(document.body, { childList: true, subtree: true });
	let running = true;
	const frame = () => {
		if (!running) return;
		if (document.querySelector(selector)) seen.push('frame');
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
	return () => {
		running = false;
		observer.disconnect();
		return seen;
	};
}

// Every text the shared announcer region says from now on.
export function listen() {
	const said: string[] = [];
	let last = document.querySelector(REGION)?.textContent ?? '';
	const observer = new MutationObserver(() => {
		const text = document.querySelector(REGION)?.textContent ?? '';
		if (text !== last && text !== '') said.push(text);
		last = text;
	});
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	return () => {
		observer.disconnect();
		return said;
	};
}

export function text(container: ParentNode, selector: string): string | null | undefined {
	return container.querySelector(selector)?.textContent;
}

export async function shows(container: ParentNode, selector: string, expected: string) {
	await expect.poll(() => text(container, selector), poll).toBe(expected);
}

// Appends streamed HTML to the document and runs its scripts, as a stream chunk arriving does.
export function play(html: string): void {
	const holder = document.createElement('div');
	holder.innerHTML = html;
	for (const node of Array.from(holder.childNodes)) {
		if ((node as Element).tagName !== 'SCRIPT') {
			document.body.append(node);
			continue;
		}
		const inert = node as HTMLScriptElement;
		const script = document.createElement('script');
		for (const attribute of Array.from(inert.attributes)) script.setAttribute(attribute.name, attribute.value);
		script.text = inert.textContent ?? '';
		document.body.append(script);
	}
}
