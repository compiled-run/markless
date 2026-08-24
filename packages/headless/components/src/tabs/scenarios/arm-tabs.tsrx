import { tabs } from '../../index.ts';

// A panel offered only on some plans, so it sits inside an @if arm.
//
// Two shapes forced this layout, both measured here:
//   * `@if` cannot be a direct child of a component tag - `@if` written straight
//     inside.
 <tabs.root> or <tabs.list> is MARKLESS_PARSE_ERROR ("Expected '</'
//     to close the JSX element, but found '@'"), so an arm needs an intrinsic
//     element around it. That rules out an armed TAB, because the only intrinsic
//     wrapper available inside.
 <tabs.list> would sit between role="tablist" and
//     its tabs and break the list's ownership of them.
//   * The condition is a module constant rather than a flipping cell: a FLIPPING
//     arm holding a shared-instance part is refused today
//     (MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED, recorded in otp.browser.ts).
const isTeamPlan = true;

export default function ArmTabs() @{
	<tabs.root value="overview" data-testid="root">
		<tabs.list data-testid="list">
			<tabs.trigger value="overview" data-testid="overview-trigger">Overview</tabs.trigger>
			<tabs.trigger value="team" data-testid="team-trigger">Team</tabs.trigger>
			<tabs.trigger value="billing" data-testid="billing-trigger">Billing</tabs.trigger>
		</tabs.list>
		<div data-testid="panels">
			<tabs.content value="overview" data-testid="overview-content">Overview.</tabs.content>
			@if (isTeamPlan) {
				<tabs.content value="team" data-testid="team-content">Seats and invites.</tabs.content>
			}
			<tabs.content value="billing" data-testid="billing-content">Invoices.</tabs.content>
		</div>
	</tabs.root>
}
