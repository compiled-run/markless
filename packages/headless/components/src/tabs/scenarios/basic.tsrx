import * as tabs from '../index.ts';

// The starter a consumer copies: three tabs, three panels, the first one
// showing.
//
// The import is the family folder rather than the package barrel because this
// family is not wired into the barrel yet; every other scenario here does the
// same, and they all become `import { tabs } from '../../index.ts'` the day the
// barrel carries it.
export default function Basic() @{
	<tabs.root value="overview" data-testid="root">
		<tabs.list data-testid="list">
			<tabs.trigger value="overview" data-testid="overview-trigger">Overview</tabs.trigger>
			<tabs.trigger value="usage" data-testid="usage-trigger">Usage</tabs.trigger>
			<tabs.trigger value="billing" data-testid="billing-trigger">Billing</tabs.trigger>
		</tabs.list>
		<tabs.content value="overview" data-testid="overview-content">
			Everything that happened this month.
		</tabs.content>
		<tabs.content value="usage" data-testid="usage-content">
			How much of the plan you have used.
		</tabs.content>
		<tabs.content value="billing" data-testid="billing-content">
			Your next invoice is due on the 1st.
		</tabs.content>
	</tabs.root>
}
