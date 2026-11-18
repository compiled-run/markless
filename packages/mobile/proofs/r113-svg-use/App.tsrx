export default function App() @{
	<main>
		<h1>Symbols</h1>
		<svg role="img" aria-label="Three stars" viewBox="0 0 90 30" width="270" height="90">
			<defs>
				<symbol id="star" viewBox="0 0 24 24">
					<path fill="#e9c46a" d="M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5-6.5 4.5 2-7.5L2 9h7z" />
				</symbol>
			</defs>
			<use href="#star" x="0" y="0" width="30" height="30" />
			<use href="#star" x="30" y="0" width="30" height="30" />
			<use href="#star" x="60" y="0" width="30" height="30" />
		</svg>
		<p>A symbol used three times</p>
	</main>
}
