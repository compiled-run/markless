// prefetch belongs to links: no other element takes it.
export function Buttons() @{
	<div>
		<button type="button" prefetch={false}>Theme</button>
		<a href="/" prefetch="no">Home</a>
	</div>
}
