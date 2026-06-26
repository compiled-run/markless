export function Nav({ libraryOpen, onToggleLibrary }) @{
	<nav>
		<h1>Waves</h1>
		<button
			type="button"
			class={libraryOpen ? 'library-button active' : 'library-button'}
			onClick={onToggleLibrary}
		>
			Library ♪
		</button>
	</nav>
}
