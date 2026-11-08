export default function Card(props: { title: string }) @{
	<article class="card" data-probe="card">
		<style>
			.card { --card-mark: card; border: 2px solid rgb(90, 90, 90); padding: 12px; }
			.card h2 { color: rgb(10, 120, 40); margin: 0; }
		</style>
		<h2>{props.title}</h2>
	</article>
}
