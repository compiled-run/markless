import * as tooltip from '../index.ts';

export default function Basic() @{
	<section style="padding: 120px 40px">
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="root">
			<tooltip.trigger data-testid="trigger">Save</tooltip.trigger>
			<tooltip.content data-testid="content">Save this draft</tooltip.content>
		</tooltip.root>
	</section>
}
