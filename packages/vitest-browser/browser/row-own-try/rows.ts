import { expect } from 'vitest';
import { answer, asked } from './gate.ts';

export const counts = () => [...document.querySelectorAll('[data-count]')].map((cell) => cell.textContent);
export const loading = () => document.querySelectorAll('[data-count-loading]').length;
export const own = ['Pen: 10', 'Ink: 20'];
export const refreshed = ['Nib: 30', 'Cap: 40'];

export async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

// A stream append is parsed after the shell, so its inline scripts run as it lands.
export function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes))
				script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

// Each row's @try is its own boundary, named by the row's key, so every row settles to its own value.
export async function settleInline(round: number, unit = '') {
	await reply(`items:${round}`);
	await expect.poll(loading).toBe(2);
	await reply(`stock:${round}`);
	await expect.poll(counts).toEqual((round ? refreshed : own).map((count) => count + unit));
}

export async function refreshStreamed(appends: ReadonlyArray<string>, container: HTMLElement, unit = '') {
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(counts).toEqual(own.map((count) => count + unit));
	document.querySelector<HTMLElement>('[data-again]')!.click();
	await settleInline(1, unit);
}
