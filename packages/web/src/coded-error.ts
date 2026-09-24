// A runtime refusal carrying its code, its docs page, and the fields a reporter reads.
export function marklessCodedError(
	name: string,
	code: string,
	detail: string,
	fields: Record<string, unknown>,
): Error {
	return Object.assign(new Error(`${code}: ${detail}`), {
		name,
		code,
		...fields,
		docsUrl: `https://markless.dev/errors/${code}`,
	});
}
