import { state } from '@markless/core';

type Props = { readonly item?: { readonly name: string } };

export default function OptionalObject({ item }: Props) @{
	let said = state('');

	<div>
		<button type="button" onClick={() => (said = item ? item.name : 'none')}>Say</button>
		<p data-g="said">{said}</p>
	</div>
}
