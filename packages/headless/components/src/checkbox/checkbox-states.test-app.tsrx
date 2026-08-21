import { checkbox } from '../index.ts';

// Five independently configured families on one page. Each one is seeded once by
// its own props, so this page pins what a config renders before any gesture.
export function App() @{
	<section data-testid="states">
		<div data-testid="plain">
			<checkbox.root>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
		<div data-testid="checked">
			<checkbox.root checked>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
		<div data-testid="mixed">
			<checkbox.root checked="mixed">
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
		<div data-testid="disabled">
			<checkbox.root disabled>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
		<div data-testid="both">
			<checkbox.root checked disabled>
				<checkbox.trigger><checkbox.indicator>Checked</checkbox.indicator></checkbox.trigger>
				<checkbox.label>Checkbox Label</checkbox.label>
			</checkbox.root>
		</div>
	</section>
}
