import { navbar } from '../../index.ts';

// A navbar entry only some people see - an admin section, a sign-in-only
// dashboard - written inside an `@if` arm.
//
// Two shapes forced this layout, both measured by the families that landed
// before this one:
//   * `@if` cannot be a direct child of a component tag - `@if` written straight
//     inside <navbar.root> is MARKLESS_PARSE_ERROR ("Expected '</' to close the
//     JSX element, but found '@'"), so an arm needs an intrinsic element around
//     it.
//   * The condition is a module constant rather than a flipping cell: a FLIPPING
//     arm holding a shared-instance part is refused today
//     (MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED). A navbar whose entries depend on
//     whether a person is signed in is the everyday shape this cannot express
//     yet, and it is recorded in note.md rather than worked around here.
const isSignedIn = true;

export default function ConditionalItem() @{
	<navbar.root aria-label="Primary" hover={false} data-testid="root">
		<navbar.item value="products" data-testid="products-item">
			<navbar.itemlink href="/products" data-testid="products-itemlink">Products</navbar.itemlink>
		</navbar.item>
		<div data-testid="account">
			@if (isSignedIn) {
				<navbar.item value="account" data-testid="account-item">
					<navbar.itemtrigger data-testid="account-itemtrigger">Account</navbar.itemtrigger>
					<navbar.itemcontent data-testid="account-itemcontent">
						<navbar.itemlink href="/account/billing" data-testid="billing-itemlink">Billing</navbar.itemlink>
					</navbar.itemcontent>
				</navbar.item>
			}
		</div>
	</navbar.root>
}
