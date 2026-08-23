import { state } from '@markless/core';
import { ComputedItem, Field, Item, Renamer, Root } from './krs.tsrx';

// The field is declared before the loop; the rows come from a keyed @for over
// data. Every reading part must submit under the declared name, flat or looped.
export default function KrsPage() @{
	let plans = state(['monthly', 'annual', 'lifetime']);

	<section data-krs-page>
		<Root>
			<Field name="plan" />
			<div data-krs-flat>
				<Item />
			</div>
			<div data-krs-rows>
				@for (const plan of plans; key plan) {
					<div data-krs-row>
						<span data-krs-plan>{plan}</span>
						<Item />
					</div>
				}
			</div>
			<div data-krs-computed-rows>
				@for (const plan of plans; key plan) {
					<div data-krs-computed-row>
						<ComputedItem />
					</div>
				}
			</div>
			<Renamer />
		</Root>
	</section>
}
