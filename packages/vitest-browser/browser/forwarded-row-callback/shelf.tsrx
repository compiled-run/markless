import { Lane } from './lane.tsrx';

export function Shelf({ onChoose }: { onChoose: (title: string) => void }) @{
	<aside>
		<Lane titles={['north', 'south', 'east']} onPick={onChoose} />
	</aside>
}
