import { menu } from '../../index.ts';

// A context area on a menu that is disabled whole: the browser's own menu is
// the only one a right-click here may open.
export default function ContextDisabled() @{
	<section style="padding: 40px">
		<menu.root disabled data-testid="locked-root">
			<menu.contextarea data-testid="locked-area">
				<p data-testid="locked-area-text">Nothing to do here.</p>
			</menu.contextarea>
			<menu.content data-testid="locked-content" aria-label="Row actions">
				<menu.item value="open" data-testid="locked-open">Open</menu.item>
			</menu.content>
		</menu.root>
	</section>
}
