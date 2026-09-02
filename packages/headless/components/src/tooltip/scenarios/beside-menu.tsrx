import { menu } from '../../index.ts';
import { tooltip } from '../../index.ts';

// A tooltip beside a menu, the tip waiting no time at all. The two ride the same
// overlay stack on different terms: the tip is a hint, the menu is not.
export default function BesideMenu() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="root" delay={0}>
			<tooltip.trigger data-testid="trigger">Copy</tooltip.trigger>
			<tooltip.content data-testid="content">Copy the link</tooltip.content>
		</tooltip.root>
		<menu.root data-testid="menu-root">
			<menu.trigger data-testid="menu-trigger">Actions</menu.trigger>
			<menu.content data-testid="menu-content">
				<menu.item value="cut" data-testid="menu-cut">Cut</menu.item>
				<menu.item value="copy" data-testid="menu-copy">Copy</menu.item>
			</menu.content>
		</menu.root>
	</section>
}
