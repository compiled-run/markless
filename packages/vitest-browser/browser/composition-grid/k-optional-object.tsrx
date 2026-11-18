import { state } from '@markless/core';

type Props = { readonly item?: { readonly name: string } };

export default function OptionalObject({ item }: Props) @{
	let said = state('');

	<div>
		<button type="button" data-say onClick={() => (said = item ? item.name : 'none')}>Say</button>
		<button
			type="button"
			data-shout
			onClick={() => {
				if (!item) {
					said = 'nobody';
					return;
				}
				said = item.name.toUpperCase();
			}}
		>
			Shout
		</button>
		<p data-g="said">{said}</p>
	</div>
}
