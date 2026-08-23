import type { PanelProps } from './part-widget-types.ts';

export function Panel({ children, ...rest }: PanelProps) @{
	<section {...rest}>{children}</section>
}
