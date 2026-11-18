import { Link } from '@markless/router';
import { Tag } from '../lib/Tag.tsrx';

export default function Shelf() @{
	<main class="shelf">
		<style>
			.shelf {
				padding: 24px;
				background: #fefae0;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
				color: #283618;
			}
			.next {
				display: block;
				margin-top: 20px;
				padding: 10px 16px;
				border-radius: 10px;
				background: #283618;
				color: #fefae0;
				font-size: 17px;
				text-decoration: none;
			}
		</style>
		<title>Shelf</title>
		<h1 class="heading">Seed shelf</h1>
		<Tag label="Basil, in stock" />
		<Tag label="Thyme, low" />
		<Link class="next" href="/basil">Open basil</Link>
	</main>
}
