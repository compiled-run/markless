// Both submit handlers are nothing but the lifted policy call, so neither keeps
// a lazy handler symbol; the cancel has to come from the eager sync policy.
export function App() @{
	<main data-concise-handler-elide>
		<form data-concise-form action="/never" onSubmit={(event) => event.preventDefault()}>
			<button data-concise-submit type="submit">Concise</button>
		</form>
		<form data-braced-form action="/never" onSubmit={(event) => { event.preventDefault(); }}>
			<button data-braced-submit type="submit">Braced</button>
		</form>
	</main>
}
