export default function App() @{
	<main>
		<h1>Search the web</h1>
		<form action="https://duckduckgo.com/?ia=web#results" role="search">
			<input type="hidden" name="sites" value="markless.dev" />
			<input name="q" aria-label="Query" placeholder="Query" />
			<button type="submit">Search</button>
		</form>
	</main>
}
