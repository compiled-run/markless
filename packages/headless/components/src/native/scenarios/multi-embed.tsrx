import { state } from '@markless/core';
import { native } from '../../index.ts';

export default function MultiEmbed() @{
	let open = state(false);
	<section data-testid="frame">
		<button
			type="button"
			data-testid="opener"
			aria-haspopup="dialog"
			aria-expanded={open}
			onClick={() => (open = true)}
		>
			Choose a city
		</button>
		<native.sheet open={open} onChange={(next) => (open = next)}>
			<h2>Choose a city</h2>
			<button type="button" data-testid="done" onClick={() => (open = false)}>
				Done
			</button>
		</native.sheet>
	</section>
}
