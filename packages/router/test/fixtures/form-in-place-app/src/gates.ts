// Server-side gates a test opens: a request held at one waits until the test releases it, with no clock.
type Gate = { readonly promise: Promise<void>; readonly open: () => void };
const store = globalThis as typeof globalThis & { __formGates?: Map<string, Gate> };
const gates = (store.__formGates ??= new Map());

function gate(name: string): Gate {
	let held = gates.get(name);
	if (!held) {
		let open!: () => void;
		const promise = new Promise<void>((resolve) => (open = resolve));
		gates.set(name, (held = { promise, open }));
	}
	return held;
}

export async function waitAt(name: string): Promise<void> {
	await gate(name).promise;
	gates.delete(name);
}

export function release(name: string): void {
	gate(name).open();
}
