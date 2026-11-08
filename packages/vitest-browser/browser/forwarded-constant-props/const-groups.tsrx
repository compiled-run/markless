import { Pair } from './pair.tsrx';

const groups = ['north', 'south'];

export default function ConstGroups() @{
	<main>
		@for (const group of groups; key group) {
			<Pair name={group} />
		}
	</main>
}
