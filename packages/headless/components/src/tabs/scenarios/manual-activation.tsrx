import { tabs } from '../../index.ts';

// Panels expensive enough that arrowing should not open them: focus moves, and
// Enter or Space is what shows the tab.
export default function ManualActivation() @{
	<tabs.root selectOnFocus={false} value="daily" data-testid="root">
		<tabs.list data-testid="list">
			<tabs.trigger value="daily" data-testid="daily-trigger">Daily</tabs.trigger>
			<tabs.trigger value="weekly" data-testid="weekly-trigger">Weekly</tabs.trigger>
			<tabs.trigger value="monthly" data-testid="monthly-trigger">Monthly</tabs.trigger>
		</tabs.list>
		<tabs.content value="daily" data-testid="daily-content">Yesterday's numbers.</tabs.content>
		<tabs.content value="weekly" data-testid="weekly-content">Last week's numbers.</tabs.content>
		<tabs.content value="monthly" data-testid="monthly-content">Last month's numbers.</tabs.content>
	</tabs.root>
}
