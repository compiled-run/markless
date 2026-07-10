export * from './contracts.ts';
export * from './coverage.ts';
export * from './invariants.ts';
export * from './locator-resolution.ts';
export * from './matrix.ts';
export * from './payload-wiring.ts';
export * from './preload-integrity.ts';
export * from './requests.ts';
export * from './strip-guarantee.ts';
export * from './verdicts.ts';
export * from './witness.ts';

// Protocol spellings are re-exported for analyzer consumers; ownership remains
// with the source packages named by each export declaration.
export { MARKLESS_ROUTER_LINK_ATTRIBUTE } from '@markless/router';
export {
	MARKLESS_ARM_BRANCH_ANCHOR_PREFIX,
	MARKLESS_ARM_BRANCH_END_ANCHOR_PREFIX,
	MARKLESS_ARM_SCRIPT_TYPE,
	MARKLESS_ASYNC_ANCHOR_PREFIX,
	MARKLESS_ASYNC_CONTAINER_ATTRIBUTE,
	MARKLESS_BOUNDARY_ATTRIBUTE,
	MARKLESS_VIEW_SCRIPT_TYPE,
} from '@markless/serializer';
export {
	MARKLESS_DEBUG_CHANNEL_SYMBOL_KEY,
	MARKLESS_DEBUG_CHANNEL_VERSION,
	MARKLESS_DEBUG_COMPILE_FLAG,
	MARKLESS_DEBUG_DIAGNOSTIC_PREFIX,
	MARKLESS_DEBUG_GLOBAL_PROPERTY,
	MARKLESS_DEBUG_INTERACTION_KIND_DIRECT_CSR,
	MARKLESS_DEBUG_INTERACTION_KIND_INLINE_RESUMER,
	MARKLESS_DEBUG_INTERACTION_KIND_NONE,
	MARKLESS_DEBUG_INTERACTION_KIND_RESUME_RECORD,
	MARKLESS_DEBUG_INTERACTION_KIND_ROUTER_DELEGATION,
	MARKLESS_DEBUG_INTERACTION_KIND_ROW_RECORD,
	MARKLESS_DEBUG_SOURCE_CALLBACK_PROP,
	MARKLESS_DEBUG_SOURCE_STREAMED_ARM,
} from '@markless/web';
