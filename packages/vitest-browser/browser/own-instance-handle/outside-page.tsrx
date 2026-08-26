import { state } from '@markless/core';
import { NestContent, NestItem, NestRoot, nestLevelState } from './nest.tsrx';

// The read that must STAY refused: a page-level handler, part of no rendered
// level, asking for a handle two rendered levels bind. The counter is written
// before the read, so a green row says the handler ran and only the read was
// refused.
export default function OutsidePage() @{
	const page = state({ ran: 0 });
	const level = nestLevelState();

	<section data-outside-page data-ran={page.ran}>
		<button
			type="button"
			data-outside
			onClick={() => {
				page.ran = page.ran + 1;
				level.contentEl?.setAttribute('data-outside-hit', 'yes');
			}}
		>read</button>
		<NestRoot>
			<NestItem name="one">
				<NestContent>
					<NestItem name="two">
						<NestContent>two</NestContent>
					</NestItem>
				</NestContent>
			</NestItem>
		</NestRoot>
	</section>
}
