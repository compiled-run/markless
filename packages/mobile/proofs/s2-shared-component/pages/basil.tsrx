import { Tag } from '../lib/Tag.tsrx';

export default function Basil() @{
	<main class="seed">
		<style>
			.seed {
				padding: 16px 28px;
				background: #ffffff;
			}
			.heading {
				font-size: 22px;
				color: #606c38;
			}
		</style>
		<title>Basil</title>
		<h1 class="heading">Sweet basil</h1>
		<Tag label="Sow in spring" />
	</main>
}
