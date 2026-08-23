import * as scrollarea from '../index.ts';

// The starter, and most consumers' answer: a fixed-height box of prose that
// scrolls, named for a screen reader and reachable with the keyboard. The
// native scrollbar is left alone, so there is nothing painted and nothing to
// position - root and viewport are the whole family here.
export default function Basic() @{
	<scrollarea.root data-testid="root" style="position: relative; width: 240px;">
		<scrollarea.viewport
			data-testid="viewport"
			aria-label="Parking rules"
			style="overflow: auto; height: 120px;"
		>
			<p>Permit holders may park in any bay marked with a blue kerb.</p>
			<p>Visitor bays are enforced between eight in the morning and six at night.</p>
			<p>The north lot closes for street cleaning on the first Monday of the month.</p>
			<p>Motorcycles park free in the marked corral beside the east stair.</p>
			<p>Charging bays are for vehicles actively charging, and for four hours at most.</p>
			<p>Report a blocked bay to the parking office rather than to the towing company.</p>
			<p>Deliveries use the loading dock, which is not part of this facility.</p>
		</scrollarea.viewport>
	</scrollarea.root>
}
