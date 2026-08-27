import { LevelContent, LevelItem } from './level.tsrx';

// Two top-level instances side by side: neither handler may reach the other's
// element, and neither may refuse for the ambiguity the pair creates.
export default function SiblingsPage() @{
	<section data-siblings-page>
		<LevelItem name="left">
			<LevelContent>left</LevelContent>
		</LevelItem>
		<LevelItem name="right">
			<LevelContent>right</LevelContent>
		</LevelItem>
	</section>
}
