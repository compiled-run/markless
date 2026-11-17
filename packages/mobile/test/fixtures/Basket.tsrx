import { state } from '@markless/core';
import { Stepper } from './Stepper.tsrx';

export function Basket() @{
	let apples = state(0);
	<main>
		<Stepper label="Apples" value={apples} onStep={() => apples++} />
	</main>
}
