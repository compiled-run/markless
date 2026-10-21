import { CellThumb, Group, Thumb } from './family.tsrx';

export default function SiblingInstanceIdsPage() @{
	<section data-page>
		<Group>
			<Thumb name="first" label="First" />
			<Thumb name="second" label="Second" />
		</Group>
		<Group>
			<CellThumb name="third" label="Third" />
			<CellThumb name="fourth" label="Fourth" />
		</Group>
	</section>
}
