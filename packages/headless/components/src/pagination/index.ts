// The family's public surface.
//
// `pageRange` is NOT here, and neither is the module it lives in. The range is
// the family's output: a consumer asks the family for it and never imports the
// arithmetic, so this family can change how it picks pages without changing what
// a consumer wrote.
//
// The surface the owner ratified is `const p = pagination.state(); const entries
// = computed(() => p.getEntries())` - the accessor as a zero-arg read on the
// family state. That shape does not compile today, and the refusal is not this
// family's to fix:
//
//   MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED: Cannot call imported helper
//   "paginationState" from "../pagination.tsrx" as component state because graph
//   analysis is not available for that module.
//
// A consumer module cannot read ANY family's shared state, because per-module
// compilation carries no interface describing another module's helper graph.
// `getEntries()` is implemented on the state object regardless, and the day that
// interface exists this export becomes `paginationState as state` and the
// accessor below retires.
//
// Until then the family publishes the same derivation as a pure accessor over
// the numbers the consumer already owns - the owner's own earlier ratified shape
// (`const { getEntries } = pagination`), which is the nearest reachable point to
// the final one. What matters either way holds: the algorithm is private and the
// consumer reads the family's own name for it.
export { pageRange as entries } from './pagination-range.ts';
export type { PageEntry } from './pagination-range.ts';
export type {
	PaginationBackTriggerProps,
	PaginationForwardTriggerProps,
	PaginationItemLinkProps,
	PaginationItemProps,
	PaginationItemTriggerProps,
	PaginationRootProps,
} from './pagination-types.ts';
export {
	PaginationBackTrigger as backtrigger,
	PaginationForwardTrigger as forwardtrigger,
	PaginationItem as item,
	PaginationItemLink as itemlink,
	PaginationItemTrigger as itemtrigger,
	PaginationRoot as root,
} from './pagination.tsrx';
