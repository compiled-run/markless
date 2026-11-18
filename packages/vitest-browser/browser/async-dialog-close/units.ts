// Stand-ins: the units list answers at once; each save is a same-origin POST held until the test answers it.
export type Unit = { id: string };

const realm = globalThis as { __dialogCloseSaves?: Array<() => void>; __dialogCloseFetch?: true };

// Installed before the runtime wraps fetch, so its write watch sees these POSTs as the page's own saves.
if (!realm.__dialogCloseFetch) {
	realm.__dialogCloseFetch = true;
	const real = globalThis.fetch;
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
		String(input) === '/dialog-close/tickets'
			? new Promise<Response>((resolve) =>
					(realm.__dialogCloseSaves ??= []).push(() => resolve(Response.json({ ok: true }, { status: 201 }))),
				)
			: real(input, init)) as typeof fetch;
}

export async function loadUnits(): Promise<Unit[]> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return [{ id: 'north' }, { id: 'south' }];
}

export async function addTicket(unitId: string): Promise<void> {
	const response = await fetch('/dialog-close/tickets', { method: 'POST', body: unitId });
	if (!response.ok) throw new Error(`The save answered ${response.status}`);
}

export function answerSaves(): void {
	for (const settle of realm.__dialogCloseSaves?.splice(0) ?? []) settle();
}
