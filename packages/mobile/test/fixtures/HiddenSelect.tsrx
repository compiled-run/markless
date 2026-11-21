import { state } from '@markless/core';

export default function HiddenSelect() @{
	let size = state('small');
	<main>
		<span>
			<select aria-hidden="true" tabindex={-1} name="size">
				<option>{size}</option>
			</select>
		</span>
		<button onClick={() => (size = size === 'small' ? 'large' : 'small')}>{`Size ${size}`}</button>
	</main>
}
