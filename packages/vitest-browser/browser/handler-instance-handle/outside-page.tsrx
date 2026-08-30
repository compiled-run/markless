import { state } from '@markless/core';
import { LevelContent, LevelItem, levelState } from './level.tsrx';

// The read that must STAY refused: a page-level handler, part of no rendered
// level, asking for a handle two rendered levels bind. The counter is written
// before the read, so a green row says the handler ran and only the read was
// refused.
export default function OutsidePage() @{
	const page = state({ ran: 0, refused: '' });
	const level = levelState();

	<section data-outside-page data-ran={page.ran} data-refused={page.refused}>
		<button
			type="button"
			data-outside
			// The refusal is a throw, so the handler that asked is where it lands.
			onClick={() => {
				page.ran = page.ran + 1;
				try {
					level.contentEl?.setAttribute('data-outside-hit', 'yes');
				} catch (error) {
					page.refused = String((error as { readonly code?: string } | null)?.code ?? 'unknown');
				}
			}}
		>read</button>
		<LevelItem name="one">
			<LevelContent>
				<LevelItem name="two">
					<LevelContent>two</LevelContent>
				</LevelItem>
			</LevelContent>
		</LevelItem>
	</section>
}
