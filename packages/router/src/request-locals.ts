// Request files and the page server entry are separate bundles in one process, so the table lives on globalThis.
const REQUEST_LOCALS = Symbol.for('@markless/router/request-locals');

type RequestRecord = { readonly locals: object; readonly headers?: Headers; taken?: Headers };

function table(): WeakMap<Request, RequestRecord> {
	const scope = globalThis as { [REQUEST_LOCALS]?: WeakMap<Request, RequestRecord> };
	return (scope[REQUEST_LOCALS] ??= new WeakMap());
}

export function rememberRequestLocals(request: Request, locals: object, headers?: Headers): void {
	const known = table().get(request);
	table().set(request, { locals, headers: headers ?? known?.headers, taken: known?.taken });
}

export function requestLocals(request: Request): object | undefined {
	return table().get(request)?.locals;
}

/**
 * The response headers middleware wrote for this request, moved off the server's
 * response: it drops them from a non-2xx page and would repeat them on a 2xx one.
 */
export function takeMiddlewareHeaders(request: Request): Headers | undefined {
	const record = table().get(request);
	if (!record?.headers) return undefined;
	if (!record.taken) {
		record.taken = new Headers(record.headers);
		for (const name of Array.from(record.headers.keys())) record.headers.delete(name);
	}
	return record.taken;
}
