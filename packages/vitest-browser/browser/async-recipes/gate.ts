// Every stand-in request waits here until the test settles it; on the server it answers at once.
type Outcome = { readonly error?: Error; readonly value?: unknown };
type Call = {
	readonly name: string;
	state: 'open' | 'aborted' | 'done';
	settle(outcome: Outcome): void;
};
type Book = { calls: Call[]; ignoreAbort: boolean };

const realm = globalThis as { __asyncRecipes?: Book };
const book = (): Book => (realm.__asyncRecipes ??= { calls: [], ignoreAbort: false });

/** `ignoreAbort` models a server that answers a request the page already gave up on. */
export function resetCalls(options: { readonly ignoreAbort?: boolean } = {}): void {
	realm.__asyncRecipes = { calls: [], ignoreAbort: options.ignoreAbort ?? false };
}

/** Every request so far, in order, as `name:open`, `name:aborted` or `name:done`. */
export function calls(): string[] {
	return book().calls.map((call) => `${call.name}:${call.state}`);
}

export function requested(name: string): number {
	return book().calls.filter((call) => call.name === name).length;
}

/** Settles the oldest unsettled request with this name. */
export function answer(name: string, outcome: Outcome = {}): void {
	const call = book().calls.find((entry) => entry.name === name && entry.state !== 'done');
	if (!call) throw new Error(`No unsettled request ${name}; requests: ${calls().join(', ')}`);
	call.settle(outcome);
}

/** Settles the request made `index`-th (from 0), whatever its state, so a test can answer a replaced request late. */
export function answerAt(index: number, outcome: Outcome = {}): void {
	const call = book().calls[index];
	if (!call || call.state === 'done') throw new Error(`Request ${index} is settled or missing: ${calls().join(', ')}`);
	call.settle(outcome);
}

/** Settles every unsettled request with this name, oldest first. */
export function answerEvery(name: string, outcome: Outcome = {}): void {
	for (const call of book().calls.filter((entry) => entry.name === name && entry.state !== 'done'))
		call.settle(outcome);
}

export function request<T>(name: string, value: T, signal?: AbortSignal): Promise<T> {
	if (typeof window === 'undefined') return Promise.resolve(value);
	return new Promise<T>((resolve, reject) => {
		const call: Call = {
			name,
			state: 'open',
			settle({ error, value: answered }) {
				const wasAborted = call.state === 'aborted';
				call.state = 'done';
				if (wasAborted && !book().ignoreAbort) return;
				if (error) reject(error);
				else resolve((answered ?? value) as T);
			},
		};
		book().calls.push(call);
		signal?.addEventListener('abort', () => {
			if (call.state !== 'open') return;
			call.state = 'aborted';
			if (!book().ignoreAbort) reject(signal.reason);
		});
	});
}
