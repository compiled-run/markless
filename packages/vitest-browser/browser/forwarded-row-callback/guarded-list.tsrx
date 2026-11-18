import { GuardedPanel } from './guarded-panel.tsrx';

export function GuardedList({ labels, onSave }: { labels: string[]; onSave: (label: string) => void }) @{
	<div>
		@for (const label of labels; key label) {
			<GuardedPanel label={label} onSave={onSave} />
		}
	</div>
}
