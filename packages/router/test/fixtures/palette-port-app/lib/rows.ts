export async function rows(n: number): Promise<{ id: string; text: string }[]> {
	await new Promise((r) => setTimeout(r, 30));
	return Array.from({ length: n }, (_, i) => ({ id: `k${i}`, text: `row ${i}` }));
}
export const log: string[] = [];
(globalThis as { __log?: string[] }).__log = log;
export async function hold(label: string): Promise<void> {
	log.push(`start ${label} ${Math.round(performance.now())}`);
	await new Promise((r) => setTimeout(r, 400));
	log.push(`end ${label} ${Math.round(performance.now())}`);
}
let timer = 0;
export function later(el: EventTarget | null, ms: number): void {
	clearTimeout(timer);
	timer = window.setTimeout(() => el?.dispatchEvent(new Event('searchsettle')), ms);
}
