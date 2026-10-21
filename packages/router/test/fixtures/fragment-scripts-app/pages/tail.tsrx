// Long enough to fill in over several frames, with a figure at the end of each block that the page's script lays out.
const BLOCKS = [0, 1, 2, 3];
const LINES = Array.from({ length: 250 }, (_, line) => line);
const MARKS = Array.from({ length: 399 }, (_, mark) => mark);

export default function TailPage() @{
	<div data-page="tail">
		<h1>Tail</h1>
		<a href="/" data-go="plain">Plain</a>
		@for (const block of BLOCKS; key block) {
			<section>
				@for (const line of LINES; key line) {
					<p>{`Block ${block}, line ${line}`}</p>
				}
				<figure data-tail data-count={MARKS.length}>
					@for (const mark of MARKS; key mark) {
						<span>{mark}</span>
					}
				</figure>
			</section>
		}
		<script src="/tail.js"></script>
	</div>
}
