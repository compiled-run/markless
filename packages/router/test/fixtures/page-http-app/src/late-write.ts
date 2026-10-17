import type { HttpContext } from '@markless/router';

// The page and the release endpoint are separate server bundles, so the gate lives on globalThis.
type Gate = { open?: () => void; opened?: Promise<void> };
const gate = globalThis as { __lateWriteGate?: Gate };
let armed: HttpContext | undefined;

export function armLateWrite(http: HttpContext) {
	armed = http;
	if (gate.__lateWriteGate) return;
	const next: Gate = {};
	next.opened = new Promise<void>((resolve) => (next.open = resolve));
	gate.__lateWriteGate = next;
}

export async function writeStatusLate() {
	await gate.__lateWriteGate?.opened;
	try {
		armed!.response.status = 500;
		return { code: 'none' };
	} catch (error) {
		return { code: String((error as Error).message).split(':')[0] };
	}
}

export function openLateWriteGate() {
	const current = gate.__lateWriteGate;
	gate.__lateWriteGate = undefined;
	current?.open?.();
	return Boolean(current);
}
