// Request files and the page server entry are separate bundles in one process, so the table lives on globalThis.
const REQUEST_LOCALS = Symbol.for('@markless/router/request-locals');

function table(): WeakMap<Request, object> {
	const scope = globalThis as { [REQUEST_LOCALS]?: WeakMap<Request, object> };
	return (scope[REQUEST_LOCALS] ??= new WeakMap());
}

export function rememberRequestLocals(request: Request, locals: object): void {
	table().set(request, locals);
}

export function requestLocals(request: Request): object | undefined {
	return table().get(request);
}
