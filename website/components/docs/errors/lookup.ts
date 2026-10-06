import { errorEntries } from './errors-data.ts';
import type { ErrorEntry } from './types.ts';

function decoded(code: string): string {
	try {
		return decodeURIComponent(code);
	} catch {
		return code;
	}
}

/** The entry for a code as it appears in a URL, matched without regard to case. */
export function findError(code: string): ErrorEntry | undefined {
	const wanted = decoded(code).trim().toUpperCase();
	return errorEntries.find((entry) => entry.code === wanted);
}
