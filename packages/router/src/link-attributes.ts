export const LINK_ATTRIBUTE = 'data-markless-router-link';
export const REPLACE_ATTRIBUTE = 'data-markless-router-replace';
export const SCROLL_ATTRIBUTE = 'data-markless-router-scroll';
export const PREFETCH_ATTRIBUTE = 'data-markless-router-prefetch';
/** What one link's `prefetch` may say besides a boolean; each lowers to PREFETCH_ATTRIBUTE as is. */
export const PREFETCH_LINK_CHOICES = ['intent', 'viewport'] as const;
export type PrefetchLinkChoice = (typeof PREFETCH_LINK_CHOICES)[number];
