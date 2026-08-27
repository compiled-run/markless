import { tooltip } from '../../index.ts';

// Several tooltips side by side, each waiting no time at all, so the rows about
// hovering and staying open are about the family rather than about a timer.
export default function Toolbar() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="bold-root" delay={0}>
			<tooltip.trigger data-testid="bold-trigger">B</tooltip.trigger>
			<tooltip.content data-testid="bold-content">Bold</tooltip.content>
		</tooltip.root>
		<tooltip.root data-testid="italic-root" delay={0}>
			<tooltip.trigger data-testid="italic-trigger">I</tooltip.trigger>
			<tooltip.content data-testid="italic-content">Italic</tooltip.content>
		</tooltip.root>
		<tooltip.root data-testid="underline-root" delay={0}>
			<tooltip.trigger data-testid="underline-trigger">U</tooltip.trigger>
			<tooltip.content data-testid="underline-content">Underline</tooltip.content>
		</tooltip.root>
	</section>
}
