// An in-page stand-in for the app's API under /grid/: every browser request waits until the test answers it.
export type Row = { readonly id: string; readonly label: string };
export type Board = {
	readonly subject: string;
	readonly round: number;
	readonly title: string;
	readonly parity: 'even' | 'odd';
	readonly items: ReadonlyArray<Row>;
};

type Waiting = { readonly request: string; readonly answer: () => void };

type Server = {
	log: string[];
	waiting: Waiting[];
	saved: Map<string, string[]>;
	/** Every child that derived from a board, with the arm it was written for and the parity it saw. */
	derives: string[];
};

const shared = globalThis as typeof globalThis & { __gridServer?: Server };
export const server: Server = (shared.__gridServer ??= { log: [], waiting: [], saved: new Map(), derives: [] });

export function resetServer(): void {
	server.log = [];
	server.waiting = [];
	server.saved = new Map();
	server.derives = [];
}

export function boardFor(subject: string, round: number, saved: ReadonlyArray<string> = []): Board {
	const base = subject === 'a' ? ['one', 'two'] : ['three'];
	return {
		subject,
		round,
		title: `${subject} round ${round}`,
		parity: round % 2 === 0 ? 'even' : 'odd',
		items: [...base, ...saved].map((label) => ({ id: `${subject}-${label}`, label: `${subject} ${label}` })),
	};
}

export const boardRequest = (subject: string, round: number) => `GET /grid/board?subject=${subject}&round=${round}`;
export const saveRequest = (subject: string) => `POST /grid/save ${subject}`;
export const failRequest = (subject: string) => `POST /grid/fail ${subject}`;

/** Answers the oldest waiting request named `request`; the caller polls until one is waiting. */
export function release(request: string): boolean {
	const found = server.waiting.find((each) => each.request === request);
	if (!found) return false;
	server.waiting.splice(server.waiting.indexOf(found), 1);
	found.answer();
	return true;
}

export const waitingRequests = () => server.waiting.map((each) => each.request);

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function held(request: string): Promise<void> {
	server.log.push(request);
	return new Promise((answer) => server.waiting.push({ request, answer }));
}

async function answer(url: URL, method: string, body: string): Promise<Response> {
	if (method === 'GET') {
		const subject = url.searchParams.get('subject') ?? '';
		const round = Number(url.searchParams.get('round'));
		await held(`GET ${url.pathname}${url.search}`);
		return json(boardFor(subject, round, server.saved.get(subject)));
	}
	if (url.pathname === '/grid/fail') {
		server.log.push(failRequest(body));
		return json({ error: 'The save was refused' }, 422);
	}
	await held(saveRequest(body));
	const saved = server.saved.get(body) ?? [];
	server.saved.set(body, [...saved, `saved ${saved.length + 1}`]);
	return json({ ok: true });
}

// Installed before the runtime wraps fetch, so its write watch sees these calls as the page's own.
export function installServer(): void {
	const real = globalThis.fetch;
	if ((real as { __gridStub?: true }).__gridStub) return;
	const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : String(input), location.href);
		if (!url.pathname.startsWith('/grid/')) return real(input, init);
		const method = (init?.method ?? 'GET').toUpperCase();
		return answer(url, method, String(init?.body ?? ''));
	};
	(stub as { __gridStub?: true }).__gridStub = true;
	globalThis.fetch = stub as typeof fetch;
}

export async function loadBoard(subject: string, round: number): Promise<Board> {
	// The server render answers at once, after a turn, so a streamed render sends it in a later chunk.
	if (typeof window === 'undefined') {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return boardFor(subject, round);
	}
	const response = await fetch(`/grid/board?subject=${subject}&round=${round}`);
	return (await response.json()) as Board;
}

export async function saveRow(subject: string): Promise<void> {
	const response = await fetch('/grid/save', { method: 'POST', body: subject });
	if (!response.ok) throw new Error('The save failed');
}

export async function failSave(subject: string): Promise<void> {
	const response = await fetch('/grid/fail', { method: 'POST', body: subject });
	if (!response.ok) throw new Error(((await response.json()) as { error: string }).error);
}

/** Records a child's derive in the browser; returns the label it shows. */
export function derive(arm: string, board: Board): string {
	if (typeof window !== 'undefined') server.derives.push(`${arm}:${board.parity}`);
	return `${arm} card for ${board.title}`;
}
