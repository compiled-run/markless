const GUARD = 'position: absolute; width: 1px; height: 1px; overflow: hidden';
const GAP = 24;

export default function App() @{
	<main class="page">
		<style>
			.page { padding: 16px; }
			.card { padding: 12px; background: rgb(240, 236, 228); }
		</style>
		<h1>Fixed styles</h1>
		<p class="card" style={"color: rgb(180, 30, 30); font-weight: 700"}>Red and bold</p>
		<p class="card" style={`margin-top: ${GAP}px; background: rgb(210, 230, 250)`}>Spaced and blue</p>
		<span style={GUARD}>Read by screen readers only</span>
	</main>
}
