import type { NativeFactCollectors } from '../../artifacts.ts';

declare const __MARKLESS_NATIVE_FACTS__: boolean | undefined;

/**
 * False only where a build defines `__MARKLESS_NATIVE_FACTS__` as false (the docs' in-browser compiler, which never passes
 * native collectors). Every use of the collectors in the shared walk is guarded by it, so there this module renders nothing.
 */
export const NATIVE_FACTS = typeof __MARKLESS_NATIVE_FACTS__ === 'undefined' || __MARKLESS_NATIVE_FACTS__;

declare const handle: unique symbol;
/** The native collectors as the shared walk holds them: opaque, so every call goes through `nativeCollectors`. */
export type NativeFactsHandle = { readonly [handle]: true };

export const nativeFactsHandle = (collectors: NativeFactCollectors | null | undefined): NativeFactsHandle | null =>
	(collectors ?? null) as unknown as NativeFactsHandle | null;

export const nativeCollectors = (facts: NativeFactsHandle): NativeFactCollectors =>
	facts as unknown as NativeFactCollectors;
