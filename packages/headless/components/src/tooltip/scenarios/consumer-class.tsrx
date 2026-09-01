import { tooltip } from '../../index.ts';

// The docs-site shape: a consumer with a <style> of its own (so its module is
// scoped) writes a class on a family part. The part must keep the family's
// scope class beside the consumer's, or the family's layered defaults go dead.
export default function ConsumerClass() @{
	<section data-testid="frame" style="padding: 120px 40px">
		<style>
			.pg-dot { letter-spacing: 3px; }
		</style>
		<button type="button" data-testid="background">Background</button>
		<tooltip.root data-testid="root">
			<tooltip.trigger class="pg-dot" data-testid="trigger">Save</tooltip.trigger>
			<tooltip.content data-testid="content">Save this draft</tooltip.content>
		</tooltip.root>
	</section>
}
