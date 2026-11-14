// Own module so browser resume names a row's ids without the rest of the protocol.
/** One keyed `@for` row's identity segment. The key is identity, never the index. */
export function protocolRowSegment(key: unknown): string {
	return `r:${encodeURIComponent(String(key))}:`;
}
