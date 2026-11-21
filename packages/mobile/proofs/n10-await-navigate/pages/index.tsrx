import { navigate } from '@markless/router';

export default function Home() @{
	<main>
		<title>Draft</title>
		<h1>Unsaved draft</h1>
		<button
			onClick={async () => {
				await navigate('/saved');
			}}
		>
			Save
		</button>
	</main>
}
