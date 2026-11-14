// In the browser each answer waits until the test releases it; the server render answers at once.
const shared = globalThis as typeof globalThis & { __childTrySameIdWaiting?: Array<() => void> };
const waiting = (shared.__childTrySameIdWaiting ??= []);

export function answer<Value>(value: Value): Promise<Value> {
	if (typeof window === 'undefined') return Promise.resolve(value);
	return new Promise((resolve) => waiting.push(() => resolve(value)));
}

export function releaseAnswers(): number {
	const released = waiting.splice(0);
	for (const release of released) release();
	return released.length;
}

export function resetAnswers(): void {
	waiting.length = 0;
}

// The server answers after a timer, so the arm it fills streams after the first flush; the browser answers at once.
export async function later<Value>(value: Value): Promise<Value> {
	if (typeof window === 'undefined') await new Promise((resolve) => setTimeout(resolve, 30));
	return value;
}
