import { Tick } from './part.tsrx';

// The adopting part that is NOT its module's first export, standing outermost:
// the record that re-derives the family's computed has to travel with the
// component that renders the value.
export default function OutermostSecondPartPage() @{
	<section data-outermost-second-part-page>
		<Tick name="louder" />
	</section>
}
