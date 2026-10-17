import type { AppLocals, HttpContext, HttpResponse } from '../../index.ts';
import { requestLocals } from '../../request-locals.ts';

export const RESPONSE_COMMITTED_CODE = 'MARKLESS_ROUTER_RESPONSE_COMMITTED';

export interface PageHttp {
	readonly context: HttpContext;
	/** Freezes the response the first byte goes out with; later writes may only repeat it. */
	commit(status: number, headers: Record<string, string>): ResponseInit & { headers: Headers };
}

type Committed = {
	readonly status: number;
	readonly statusText?: string;
	readonly headers: Headers;
};

export function createPageHttp(request: Request, url: URL): PageHttp {
	let committed: Committed | undefined;
	let status: number | undefined;
	let statusText: string | undefined;
	const refuse = (write: string): never => {
		throw new Error(
			`${RESPONSE_COMMITTED_CODE}: ${write} ran after the page's response started streaming to the browser, so its status and headers were already sent. Set http.response before the first byte goes out: in the page body, before any await that outlives the first flush.`,
		);
	};
	const headers = new PageHeaders((write, unchanged) => {
		if (committed && !unchanged(committed.headers)) refuse(write);
	});
	const response: HttpResponse = {
		headers,
		get status() {
			return status;
		},
		set status(value) {
			if (committed && value !== committed.status) refuse(`http.response.status = ${value}`);
			status = value;
		},
		get statusText() {
			return statusText;
		},
		set statusText(value) {
			if (committed && value !== committed.statusText)
				refuse(`http.response.statusText = ${JSON.stringify(value)}`);
			statusText = value;
		},
	};
	const context: HttpContext = {
		locals: (requestLocals(request) ?? {}) as AppLocals,
		request,
		response,
		url,
	};
	return {
		context,
		commit(fallbackStatus, routerHeaders) {
			const sent = new Headers(routerHeaders);
			for (const [name, value] of headers) if (name !== 'set-cookie') sent.set(name, value);
			for (const cookie of headers.getSetCookie()) sent.append('set-cookie', cookie);
			committed = { status: status ?? fallbackStatus, statusText, headers: sent };
			return {
				status: committed.status,
				...(statusText === undefined ? {} : { statusText }),
				headers: sent,
			};
		},
	};
}

class PageHeaders extends Headers {
	readonly #guard: (write: string, unchanged: (sent: Headers) => boolean) => void;

	constructor(guard: (write: string, unchanged: (sent: Headers) => boolean) => void) {
		super();
		this.#guard = guard;
	}

	override set(name: string, value: string): void {
		this.#guard(`http.response.headers.set(${JSON.stringify(name)})`, (sent) =>
			name.toLowerCase() === 'set-cookie'
				? sent.getSetCookie().includes(value)
				: sent.get(name) === value,
		);
		super.set(name, value);
	}

	override append(name: string, value: string): void {
		this.#guard(`http.response.headers.append(${JSON.stringify(name)})`, (sent) =>
			name.toLowerCase() === 'set-cookie'
				? sent.getSetCookie().includes(value)
				: (sent.get(name)?.split(', ') ?? []).includes(value),
		);
		// Each render pass re-runs the page body, so an identical append is that pass repeating it.
		if (!headerValues(this, name).includes(value)) super.append(name, value);
	}

	override delete(name: string): void {
		this.#guard(
			`http.response.headers.delete(${JSON.stringify(name)})`,
			(sent) => !sent.has(name),
		);
		super.delete(name);
	}
}

function headerValues(headers: Headers, name: string): string[] {
	return name.toLowerCase() === 'set-cookie'
		? headers.getSetCookie()
		: (headers.get(name)?.split(', ') ?? []);
}
