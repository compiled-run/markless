import { Badge } from './FamilyBadge.tsrx';

export function Panel() @{
	<section>
		<style>
			.tone {
				background: #ffd166;
				color: #22223b;
				font-size: 18px;
				padding: 6px 12px;
			}
		</style>
		<Badge class="tone" label="Badge" />
	</section>
}
