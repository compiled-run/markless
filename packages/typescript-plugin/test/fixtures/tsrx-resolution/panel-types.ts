import type { PropsOf } from '@markless/core';

export type PanelRootProps = PropsOf<'section'> & {
	readonly heading: string;
	readonly collapsed?: boolean;
};

export type PanelItemProps = PropsOf<'li'> & {
	readonly badge: number;
};
