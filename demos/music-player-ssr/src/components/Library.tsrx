import { LibrarySong } from './LibrarySong.tsrx';

export function Library({
	libraryOpen,
	songOne,
	songTwo,
	songThree,
	songFour,
	onSelectOne,
	onSelectTwo,
	onSelectThree,
	onSelectFour,
}) @{
	<div class={libraryOpen ? 'library active-library' : 'library'}>
		<h2>Library</h2>
		<div class="library-songs">
			<LibrarySong song={songOne} selected={songOne.active} onSelect={onSelectOne} />
			<LibrarySong song={songTwo} selected={songTwo.active} onSelect={onSelectTwo} />
			<LibrarySong song={songThree} selected={songThree.active} onSelect={onSelectThree} />
			<LibrarySong song={songFour} selected={songFour.active} onSelect={onSelectFour} />
		</div>
	</div>
}
