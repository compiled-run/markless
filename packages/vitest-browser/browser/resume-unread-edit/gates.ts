type Gate = { promise: Promise<void>; release: () => void };
type GateHost = {
	__resumeUnreadEditGates?: Record<string, Gate>;
	__resumeUnreadEditWaiting?: Set<string>;
};

const gates = () => ((globalThis as GateHost).__resumeUnreadEditGates ??= {});
const waiting = () => ((globalThis as GateHost).__resumeUnreadEditWaiting ??= new Set());

export function isWaiting(name: string): boolean {
	return waiting().has(name);
}

export function close(name: string): void {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => (release = resolve));
	gates()[name] = { promise, release };
}

export function open(name: string): void {
	gates()[name]?.release();
	delete gates()[name];
}

export function reset(): void {
	for (const name of Object.keys(gates())) open(name);
	waiting().clear();
}

// Nothing is closed on the server, so its render never waits.
export async function pass(name: string): Promise<void> {
	const gate = gates()[name];
	if (!gate) return;
	waiting().add(name);
	await gate.promise;
}
