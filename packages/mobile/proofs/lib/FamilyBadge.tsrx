import { computed, state } from '@markless/core';

type Point = { id: string };

function idOf(point: Point | undefined): string {
	if (point === undefined) return 'none';
	return point.id;
}

export function Badge({ value, label, ...rest }: { value?: Point; label: string; class?: string }) @{
	const handle = state({ point: value });
	const shown = computed(() => idOf(handle.point));
	<>
		<span {...rest} ui-badge="">
			<style>
				@layer markless {
					[ui-badge] {
						display: block;
						margin: 12px;
						border: 4px solid #06d6a0;
					}
				}
			</style>
			{label}
		</span>
		<p>{`Seed ${shown}`}</p>
	</>
}
