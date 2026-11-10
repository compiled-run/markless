// Shared, settable latency for the pending-immediate frame-sampling proof.
let current = 50;

export function setLatency(ms: number) {
	current = ms;
}

export function wait(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, current));
}
