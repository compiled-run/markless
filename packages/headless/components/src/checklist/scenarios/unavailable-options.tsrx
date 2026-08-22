import { checkbox, checklist } from '../../index.ts';

// Two lists nobody can fully use: the first locks one option, the second locks
// the whole group from the root, which a `<fieldset disabled>` also enforces
// natively on every control inside it.
export default function UnavailableOptions() @{
	<section>
		<checklist.root value={['tomato']} values={['tomato', 'caviar']} data-testid="root">
			<checklist.label data-testid="label">Sandwich Condiments</checklist.label>
			<checklist.selectall data-testid="selectall">
				<checkbox.trigger data-testid="selectall-trigger">
					<checkbox.indicator data-testid="selectall-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="selectall-label">All condiments</checkbox.label>
			</checklist.selectall>
			<checklist.item value="tomato" data-testid="tomato">
				<checkbox.trigger data-testid="tomato-trigger">
					<checkbox.indicator data-testid="tomato-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="tomato-label">Tomato</checkbox.label>
			</checklist.item>
			<checklist.item value="caviar" disabled data-testid="caviar">
				<checkbox.trigger data-testid="caviar-trigger">
					<checkbox.indicator data-testid="caviar-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="caviar-label">Not available on your plan</checkbox.label>
			</checklist.item>
		</checklist.root>
		<checklist.root disabled values={['mustard']} data-testid="locked-root">
			<checklist.label data-testid="locked-label">Fixed by your plan</checklist.label>
			<checklist.selectall data-testid="locked-selectall">
				<checkbox.trigger data-testid="locked-selectall-trigger">
					<checkbox.indicator data-testid="locked-selectall-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
			</checklist.selectall>
			<checklist.item value="mustard" data-testid="locked-mustard">
				<checkbox.trigger data-testid="locked-mustard-trigger">
					<checkbox.indicator data-testid="locked-mustard-indicator">Checked</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label data-testid="locked-mustard-label">Mustard</checkbox.label>
			</checklist.item>
		</checklist.root>
	</section>
}
