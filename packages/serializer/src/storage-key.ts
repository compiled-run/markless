// The storage key grammar, alone in its own module on purpose.
//
// The production payload decoder (protocol-client) must validate storage keys,
// so whatever module it imports this from is in every resuming page's eager
// chunk. The rest of the storage surface — the slot symbol, the slot-entry key
// derivation, the no-flash attribute name — is client-storage-only and is
// demand-loaded with the storage plane. Keeping them in one module put all of
// it in the eager chunk, because a lazy chunk importing from an eager module
// pins that module's exports there.
//
// A storage key is either an author's verbatim explicit key or a derived
// markless:<identifier>. Permissive but structurally safe: letters, digits, and
// $ _ : . - only (no whitespace, quotes, brackets, or control characters). The
// colon admits the markless: namespace; the resume decoder uses this to reject
// malformed payloads.
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9$_:.-]+$/;

export function isValidStorageKey(value: string): boolean {
	return STORAGE_KEY_PATTERN.test(value);
}
