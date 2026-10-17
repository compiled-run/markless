export default function Banner(props: { title: string }) @{
	<section class="banner" data-banner>
		<style>
			.banner { color: rgb(11, 22, 33); }
		</style>
		<h2>{props.title}</h2>
	</section>
}
