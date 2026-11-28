export function Page() @{
	<div>
		<p onDocumentFocus={() => {}}>a</p>
		<p onWindowSelectionChange={() => {}}>b</p>
		<p onDocumentResize={() => {}}>c</p>
		<p onWindowKeyDown={(event) => event.clientX}>d</p>
		<p
			onDocumentKeyDown={(event) => {
				const owner: HTMLParagraphElement = event.currentTarget;
				return owner;
			}}
		>
			e
		</p>
	</div>
}
