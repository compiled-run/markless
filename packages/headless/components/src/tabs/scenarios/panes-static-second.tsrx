import { tabs } from '../../index.ts';

// Static panes that open on the second tab, so a click walks backwards onto the
// first: it says which `value` a resumed panel is actually comparing against.
export default function PanesStaticSecond() @{
	<section>
		<tabs.root value="styles" data-testid="prop-root">
			<tabs.list data-testid="prop-list">
				<div role="presentation" data-testid="prop-strip">
					<tabs.trigger value="source" data-testid="prop-trigger">source.tsrx</tabs.trigger>
					<tabs.trigger value="styles" data-testid="prop-trigger">styles.css</tabs.trigger>
					<tabs.trigger value="tests" data-testid="prop-trigger">tests.ts</tabs.trigger>
				</div>
			</tabs.list>
			<div data-testid="prop-panes">
				<tabs.content value="source" data-testid="prop-content">The first file.</tabs.content>
				<tabs.content value="styles" data-testid="prop-content">The second file.</tabs.content>
				<tabs.content value="tests" data-testid="prop-content">The third file.</tabs.content>
			</div>
		</tabs.root>
	</section>
}
