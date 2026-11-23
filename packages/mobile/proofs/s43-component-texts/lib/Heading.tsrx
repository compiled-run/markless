export default function Heading({ name }: { readonly name: string }) @{
	<h1 class="heading">
		<style>
			.heading {
				margin: 0;
				font-size: 28px;
				font-weight: 700;
			}
		</style>
		Note {name}
	</h1>
}
