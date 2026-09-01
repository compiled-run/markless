import { tabs } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths. `billing` is last so ArrowRight from there either stays in this
// embed or lands in the next one's first trigger.
export default function MultiEmbed() @{
	<section data-testid="frame">
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
	</section>
}
