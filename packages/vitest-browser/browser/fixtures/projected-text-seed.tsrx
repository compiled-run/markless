import type { Children } from '@markless/core';
import { shared, state } from '@markless/core';

const meter = shared(() => {
	const reading = state({ own: '' as Children });
	return reading;
}, { scope: 'widget' });

export function MeterRoot({ children }: { readonly children?: Children }) @{
	const m = meter();
	<div data-meter ui-own={m.own}>{children}</div>
}

export function MeterCaption({ children }: { readonly children?: Children }) @{
	const m = meter();
	<em data-caption ui-empty={m.own === ''}>{children}</em>
}

export function MeterReadout({ children }: { readonly children?: Children }) @{
	const m = meter();
	m.own = children;
	<b data-readout>{children}</b>
}
