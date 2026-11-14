// Own module so browser resume names an instance's ids without the rest of the protocol.
const PROTOCOL_INSTANCE_PATH = /^(?:[cpm]\d+:|r:[^:]*:)+/;

/** The leading instance path of a composed id, or '' when the id is page-local. */
export function protocolInstancePath(id: string): string {
	return PROTOCOL_INSTANCE_PATH.exec(id)?.[0] ?? '';
}

/** One keyed `@for` row's identity segment. The key is identity, never the index. */
export function protocolRowSegment(key: unknown): string {
	return `r:${encodeURIComponent(String(key))}:`;
}
