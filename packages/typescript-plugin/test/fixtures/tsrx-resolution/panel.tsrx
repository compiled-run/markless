import type { PanelItemProps, PanelRootProps } from './panel-types.ts';

export function PanelRoot({ heading, collapsed = false, children, ...rest }: PanelRootProps) @{
	<section {...rest} ui-collapsed={collapsed}>
		<h2>{heading}</h2>
		{children}
	</section>
}

export function PanelItem({ badge, children, ...rest }: PanelItemProps) @{
	<li {...rest} data-badge={badge}>{children}</li>
}
