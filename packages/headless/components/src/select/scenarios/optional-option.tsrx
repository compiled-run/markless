import * as select from '../index.ts';

// An option that only some builds offer. The condition is a module constant, not
// a state cell: a widget-root part inside an arm that FLIPS is refused at compile
// time (MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED), so the everyday "this option
// appears when a checkbox is on" form is a framework wall - see note.md.
const IS_LIFETIME_OFFERED = true;

export function OptionalOption() @{
	<select.root data-testid="root">
		<select.label data-testid="label">Billing Plan</select.label>
		<select.trigger data-testid="trigger">Choose a plan</select.trigger>
		<select.content data-testid="content">
			<div data-testid="rows" role="presentation">
				<select.item value="monthly" data-testid="monthly">
					<select.itemlabel>Monthly</select.itemlabel>
				</select.item>
				@if (IS_LIFETIME_OFFERED) {
					<select.item value="lifetime" data-testid="lifetime">
						<select.itemlabel>Lifetime</select.itemlabel>
					</select.item>
				}
			</div>
		</select.content>
	</select.root>
}
