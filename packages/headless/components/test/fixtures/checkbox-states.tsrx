import { checkbox } from '../../src/index.ts';

// Five independently configured families on one page. Each one is seeded once by
// its own props, so this page pins what a config renders before any gesture.
export function App() @{
	<section data-testid="states">
		<div data-case="plain">
			<checkbox.root>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
		<div data-case="checked">
			<checkbox.root checked>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
		<div data-case="mixed">
			<checkbox.root checked="mixed">
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
		<div data-case="disabled">
			<checkbox.root disabled>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
		<div data-case="both">
			<checkbox.root checked disabled>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
	</section>
}
