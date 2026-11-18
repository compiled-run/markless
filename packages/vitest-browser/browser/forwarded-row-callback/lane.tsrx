import { Chip } from './chip.tsrx';

export function Lane({ titles, onPick }: { titles: string[]; onPick: (title: string) => void }) @{
	<section>
		@for (const title of titles; key title) {
			<Chip title={title} onPick={onPick} />
		}
	</section>
}
