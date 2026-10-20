import { state } from '@markless/core';

export default function MovedVisibleOnlyPage() @{
	let seen = state(0);
	let above = state(0);
	<main>
		<div data-list>
			<p data-above>{above}</p>
			<div style="height: 3000px"></div>
			<section data-watched data-seen-attr={seen} onVisible={() => {
				seen++;
				above = above + 10;
				setTimeout(() => {
					seen++;
					above = above + 10;
				}, 50);
			}}>
				<span data-seen>{seen}</span>
			</section>
		</div>
	</main>;
}
