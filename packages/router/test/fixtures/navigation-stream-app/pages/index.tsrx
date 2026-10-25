// The links sit below the fold, so the idle tier never fetches their pages before the click.
export default function Start() @{
	<main data-page="start">
		<h1>start</h1>
		<div style="height: 3000px">spacer</div>
		<a data-to-recipe href="/recipe?u=2">to the slow page</a>
		<a data-to-other-recipe href="/recipe?u=3">to another slow page</a>
		<a data-to-quick href="/quick">to the quick page</a>
		<a data-to-arm-link href="/arm-link">to the link page</a>
		<a data-to-toggle href="/toggle">to the toggle page</a>
	</main>
}
