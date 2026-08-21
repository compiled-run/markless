import { checkbox } from '../index.ts';

// Two independent checkboxes on one page: what a click on one must NOT do to
// the other. The instance's purpose prefixes each part's role.
export default function TwoCheckboxes() @{
	<section>
		<checkbox.root data-testid="first-root">
			<checkbox.trigger data-testid="first-trigger">
				<checkbox.indicator data-testid="first-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="first-label">Checkbox Label</checkbox.label>
		</checkbox.root>
		<checkbox.root checked data-testid="second-root">
			<checkbox.trigger data-testid="second-trigger">
				<checkbox.indicator data-testid="second-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="second-label">Checkbox Label</checkbox.label>
		</checkbox.root>
		<checkbox.root checked="mixed" data-testid="third-root">
			<checkbox.trigger data-testid="third-trigger">
				<checkbox.indicator data-testid="third-indicator">Checked</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label data-testid="third-label">Checkbox Label</checkbox.label>
		</checkbox.root>
	</section>
}
