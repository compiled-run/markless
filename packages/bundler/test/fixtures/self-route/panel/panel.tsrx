import { state } from '@markless/core';

type PanelPartProps = {
	readonly children?: unknown;
	readonly [attribute: string]: unknown;
};

export function PanelRoot({ children, ...rest }: PanelPartProps) @{
	<div {...rest} role="tree">{children}</div>
}

export function PanelItem({ children, ...rest }: PanelPartProps) @{
	let open = state(true);

	<div
		{...rest}
		role="treeitem"
		ui-open={open}
		onClick={() => open = open !== true}
	>{children}</div>
}

export function PanelItemLabel({ children, ...rest }: PanelPartProps) @{
	<span {...rest}>{children}</span>
}

export function PanelItemContent({ children, ...rest }: PanelPartProps) @{
	<div {...rest} role="group">{children}</div>
}
