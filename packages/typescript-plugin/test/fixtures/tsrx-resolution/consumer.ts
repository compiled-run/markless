import { item, root } from './index.ts';
import type { PanelRootProps } from './index.ts';

// A plain .ts consumer must see each part's real signature through the barrel.
type RootProps = Parameters<typeof root>[0];
type ItemProps = Parameters<typeof item>[0];

export const heading: RootProps['heading'] = 'Details';
export const badge: ItemProps['badge'] = 3;
export const collapsed: PanelRootProps['collapsed'] = true;
export const parts = { item, root };
