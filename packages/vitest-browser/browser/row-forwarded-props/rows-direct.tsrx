import { state } from '@markless/core';
import { Choice } from './choice.tsrx';

export default function RowsDirect() @{
	const groups = state(['one', 'two']);
	<main>
		@for (const group of groups; key group) {
			<section><Choice to="dark" name={group} /><Choice to="light" name={group} /></section>
		}
	</main>
}
