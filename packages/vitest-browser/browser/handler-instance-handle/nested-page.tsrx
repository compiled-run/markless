import { LevelContent, LevelItem } from './level.tsrx';

// Three levels, each item written inside the level above it.
export default function NestedPage() @{
	<section data-nested-page>
		<LevelItem name="one">
			<LevelContent>
				<LevelItem name="two">
					<LevelContent>
						<LevelItem name="three">
							<LevelContent>deepest</LevelContent>
						</LevelItem>
					</LevelContent>
				</LevelItem>
			</LevelContent>
		</LevelItem>
	</section>
}
