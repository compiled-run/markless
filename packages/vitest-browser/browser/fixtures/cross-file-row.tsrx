import type { Children } from '@markless/core';

export function Row({ hot, children }: { readonly hot?: boolean; readonly children?: Children }) @{
	<div data-row data-hot={hot ? 'true' : 'false'}>{children}<style>div { display: block; }</style></div>
}

export function Gauge(props: { readonly level: number; readonly unit: string }) @{
	<meter data-gauge title={props.level + ' ' + props.unit} value={props.level} max="10">{props.level > 5 ? 'high' : 'low'}</meter>
}
