import { toggle } from '../../src/index.ts';

// Four independently configured switches on one page. Each one is seeded once by
// its own props, so this page pins what a config renders before any gesture.
export function App() @{
	<section data-testid="states">
		<div data-case="plain">
			<toggle.root>
				<toggle.label>Enable notifications</toggle.label>
				<toggle.trigger><toggle.thumb /></toggle.trigger>
			</toggle.root>
		</div>
		<div data-case="checked">
			<toggle.root checked>
				<toggle.label>Enable notifications</toggle.label>
				<toggle.trigger><toggle.thumb /></toggle.trigger>
			</toggle.root>
		</div>
		<div data-case="disabled">
			<toggle.root disabled>
				<toggle.label>Enable notifications</toggle.label>
				<toggle.trigger><toggle.thumb /></toggle.trigger>
			</toggle.root>
		</div>
		<div data-case="both">
			<toggle.root checked disabled>
				<toggle.label>Enable notifications</toggle.label>
				<toggle.trigger><toggle.thumb /></toggle.trigger>
			</toggle.root>
		</div>
	</section>
}
