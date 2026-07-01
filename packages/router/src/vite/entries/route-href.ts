const routeParamPattern = /\[\.\.\.([A-Za-z_$][\w$]*)\]|\[([A-Za-z_$][\w$]*)\]/g;

export function __marklessRouteHref(
	pattern: string,
	params: Readonly<Record<string, unknown>>,
): string {
	return pattern.replace(routeParamPattern, (_match, catchAll, dynamic) => {
		const name = catchAll || dynamic;
		const value = params?.[name];

		if (catchAll) {
			return encodeCatchAllParam(pattern, value);
		}

		if (value === null || value === undefined) {
			throw new Error(`Typed route error: ${pattern} requires params:\n- ${name}`);
		}

		return encodeURIComponent(String(value));
	});
}

function encodeCatchAllParam(pattern: string, value: unknown): string {
	const segments = Array.isArray(value)
		? value
		: value === null || value === undefined
			? []
			: String(value).split('/');

	if (segments.length === 0 || segments.some((segment) => String(segment) === '')) {
		throw new Error(`Typed route error: ${pattern} requires a non-empty catch-all param.`);
	}

	return segments.map((segment) => encodeURIComponent(String(segment))).join('/');
}
