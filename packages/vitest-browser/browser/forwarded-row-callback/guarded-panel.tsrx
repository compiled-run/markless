import { computed } from '@markless/core';

export function GuardedPanel({ label, onSave }: { label: string; onSave: (label: string) => void }) @{
	const ready = computed(async () => {
		await new Promise((done) => setTimeout(done, 20));
		return `${label} ready`;
	});

	<div>
		@try {
			<button type="button" data-save={label} onClick={() => onSave(label)}>{ready}</button>
		} @pending {
			<span>waiting</span>
		}
	</div>
}
