import { shared, state } from '@markless/core';

export const visits = shared(() => {
	const v = state({ count: 0 });
	return v;
});

export function VisitButton() @{
	const v = visits();
	<button type="button" data-visit onClick={() => (v.count = v.count + 1)}>{'Count a visit'}</button>
}
