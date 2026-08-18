export const ASYNC_PROTOCOL_VERSION = 1;
export const STORAGE_PROTOCOL_VERSION = 2;

// One rule for "which state protocol version does this payload speak": the
// storage records and the version stamp must be decided together, or the
// client's storage validator rejects a version-2 payload with no array.
export function protocolStateVersion(
	storage: readonly unknown[] | undefined,
): typeof ASYNC_PROTOCOL_VERSION | typeof STORAGE_PROTOCOL_VERSION {
	return (storage?.length ?? 0) > 0 ? STORAGE_PROTOCOL_VERSION : ASYNC_PROTOCOL_VERSION;
}

export const ASYNC_BOUNDARY_ARM_MIN = 0;
export const ASYNC_BOUNDARY_ARM_PENDING = 1;
export const ASYNC_BOUNDARY_ARM_MAX = 2;
