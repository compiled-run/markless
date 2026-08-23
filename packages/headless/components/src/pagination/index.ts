// The family's public surface. The range arithmetic is not on it: a consumer asks
// the family for the range and never imports the module, so how pages are picked can
// change without changing what a consumer wrote.
//
// The intended shape is `const p = pagination.state(); computed(() => p.getEntries())`,
// which does not compile: a consumer module cannot read another module's shared
// state, because per-module compilation carries no interface describing another
// module's helper graph (MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED). `getEntries()` is
// implemented on the state object regardless, and the day that interface exists this
// export becomes `paginationState as state` and the accessor below retires.
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
