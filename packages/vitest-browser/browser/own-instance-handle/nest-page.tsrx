import { NestContent, NestItem, NestRoot } from './nest.tsrx';

// Three levels, each item written inside the level above it. One part seeds the
// level family, so every item roots its own instance.
export default function NestPage() @{
	<section data-nest-page>
		<NestRoot>
			<NestItem name="one">
				<NestContent>
					<NestItem name="two">
						<NestContent>
							<NestItem name="three">
								<NestContent>deepest</NestContent>
							</NestItem>
						</NestContent>
					</NestItem>
				</NestContent>
			</NestItem>
		</NestRoot>
	</section>
}
