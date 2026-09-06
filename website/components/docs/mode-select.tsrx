import { select } from '@markless/ui';
import { lucide } from '@markless/ui';

type Mode = 'framework' | 'ui';

export default function ModeSelect({ mode }: { readonly mode: Mode }) @{
	const title = mode === 'framework' ? 'Framework' : 'UI';

	<div class="mode-select-island">
		<select.root
			class="mode-select-control"
			value={mode}
			name="documentation-mode"
			onChange={(value) => {
				if (value === 'framework') location.assign('/markless');
				if (value === 'ui') location.assign('/markless/ui');
			}}
		>
			<select.label
				style="clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px;"
			>Documentation mode</select.label>
			<select.trigger class="mode-select-trigger">
				<span>{title}</span>
				<span class="mode-select-caret" aria-hidden="true">
					<lucide.chevrondown class="ico" />
				</span>
			</select.trigger>
			<select.content class="mode-select-content">
				<select.item class="mode-select-item" value="framework">
					<select.itemlabel class="mode-select-item-label">Framework</select.itemlabel>
					<select.itemindicator class="mode-select-item-indicator">
						<lucide.check class="ico" aria-hidden="true" />
					</select.itemindicator>
				</select.item>
				<select.item class="mode-select-item" value="ui">
					<select.itemlabel class="mode-select-item-label">UI</select.itemlabel>
					<select.itemindicator class="mode-select-item-indicator">
						<lucide.check class="ico" aria-hidden="true" />
					</select.itemindicator>
				</select.item>
			</select.content>
			<select.field />
		</select.root>
	</div>
}
