import { tabs } from '../../index.ts';

// Arrowing past either end lands on the other, with a tab nobody may open in
// the middle for the walk to step over. Both a horizontal set and a vertical
// one, because looping is per axis.
export default function Looping() @{
	<section>
		<tabs.root loop value="one" data-testid="row-root">
			<tabs.list data-testid="row-list">
				<tabs.trigger value="one" data-testid="row-one">One</tabs.trigger>
				<tabs.trigger value="two" disabled data-testid="row-two">Two</tabs.trigger>
				<tabs.trigger value="three" data-testid="row-three">Three</tabs.trigger>
			</tabs.list>
			<tabs.content value="one" data-testid="row-one-content">First.</tabs.content>
			<tabs.content value="two" data-testid="row-two-content">Second.</tabs.content>
			<tabs.content value="three" data-testid="row-three-content">Third.</tabs.content>
		</tabs.root>
		<tabs.root loop orientation="vertical" value="one" data-testid="column-root">
			<tabs.list data-testid="column-list">
				<tabs.trigger value="one" data-testid="column-one">One</tabs.trigger>
				<tabs.trigger value="two" disabled data-testid="column-two">Two</tabs.trigger>
				<tabs.trigger value="three" data-testid="column-three">Three</tabs.trigger>
			</tabs.list>
			<tabs.content value="one" data-testid="column-one-content">First.</tabs.content>
			<tabs.content value="two" data-testid="column-two-content">Second.</tabs.content>
			<tabs.content value="three" data-testid="column-three-content">Third.</tabs.content>
		</tabs.root>
	</section>
}
