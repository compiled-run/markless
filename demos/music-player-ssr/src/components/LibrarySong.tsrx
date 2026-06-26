export function LibrarySong({ song, selected, onSelect }) @{
	<button
		type="button"
		class={selected ? 'library-song selected' : 'library-song'}
		onClick={onSelect}
	>
		<img alt={song.name} src={song.cover} />
		<span class="song-description">
			<h3>{song.name}</h3>
			<h4>{song.artist} - YouTube</h4>
		</span>
	</button>
}
