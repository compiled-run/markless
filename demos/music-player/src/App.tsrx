import { buildComputed, state } from '@markless/core';
import { Nav } from './components/Nav.tsrx';
import { Song } from './components/Song.tsrx';
import { Player } from './components/Player.tsrx';
import { Library } from './components/Library.tsrx';
import { installYouTubeController } from './youtube-controller';

export function App() @{
	let libraryStatus = state(false);
	let isPlaying = state(false);
	const songOne = state({
		id: 'track-one',
		name: 'Do I Clench My Fists? (Slowed + Reverb)',
		artist: 'ridgeclub',
		cover: 'https://i.ytimg.com/vi/DwTzcZxyUUg/maxresdefault.jpg',
		videoId: 'DwTzcZxyUUg',
		color: ['#2f4f66', '#a57c5b'],
		active: true,
	});
	const songTwo = state({
		id: 'track-two',
		name: 'Empty Crown',
		artist: 'Yas',
		cover: 'https://i.ytimg.com/vi/m_qlgFQs7E4/maxresdefault.jpg',
		videoId: 'm_qlgFQs7E4',
		color: ['#4b3f72', '#d79f6f'],
		active: false,
	});
	const songThree = state({
		id: 'track-three',
		name: 'No Problem',
		artist: 'J.Lamotta, Misha, cocabona',
		cover: 'https://i.ytimg.com/vi/UQ0KmrvBPaY/maxresdefault.jpg',
		videoId: 'UQ0KmrvBPaY',
		color: ['#31572c', '#9ec5ab'],
		active: false,
	});
	const songFour = state({
		id: 'track-four',
		name: "Fallin'",
		artist: 'Ruck P',
		cover: 'https://i.ytimg.com/vi/JhkqWaiYgA8/maxresdefault.jpg',
		videoId: 'JhkqWaiYgA8',
		color: ['#7d4e57', '#d9a441'],
		active: false,
	});
	let currentSong = state({
		id: 'track-one',
		name: 'Do I Clench My Fists? (Slowed + Reverb)',
		artist: 'ridgeclub',
		cover: 'https://i.ytimg.com/vi/DwTzcZxyUUg/maxresdefault.jpg',
		videoId: 'DwTzcZxyUUg',
		color: ['#2f4f66', '#a57c5b'],
		active: true,
	});
	let playerCommand = state('cue');
	let playerCommandVersion = state(0);

	<div
		class={libraryStatus ? 'App library-active' : 'App'}
		attach={buildComputed(installYouTubeController)}
	>
		<Nav
			libraryOpen={libraryStatus}
			onToggleLibrary={() => libraryStatus = !libraryStatus}
		/>
		<Song
			currentSong={currentSong}
			isPlaying={isPlaying}
			playerCommand={playerCommand}
			playerCommandVersion={playerCommandVersion}
		/>
		<div class="youtube-state-sync">
			<button type="button" class="youtube-sync-playing" onClick={() => isPlaying = true}></button>
			<button type="button" class="youtube-sync-paused" onClick={() => isPlaying = false}></button>
		</div>
		<Player
			currentSong={currentSong}
			isPlaying={isPlaying}
			onPlayToggle={() => {
				playerCommand = isPlaying ? 'pause' : 'play';
				playerCommandVersion++;
				isPlaying = !isPlaying;
			}}
			onPrevious={() => {
				playerCommand = isPlaying ? 'load' : 'cue';
				playerCommandVersion++;
				songOne.active = currentSong.id === 'track-two';
				songTwo.active = currentSong.id === 'track-three';
				songThree.active = currentSong.id === 'track-four';
				songFour.active = currentSong.id === 'track-one';
				currentSong = currentSong.id === 'track-one' ? songFour : currentSong.id === 'track-two' ? songOne : currentSong.id === 'track-three' ? songTwo : songThree;
			}}
			onNext={() => {
				playerCommand = isPlaying ? 'load' : 'cue';
				playerCommandVersion++;
				songOne.active = currentSong.id === 'track-four';
				songTwo.active = currentSong.id === 'track-one';
				songThree.active = currentSong.id === 'track-two';
				songFour.active = currentSong.id === 'track-three';
				currentSong = currentSong.id === 'track-one' ? songTwo : currentSong.id === 'track-two' ? songThree : currentSong.id === 'track-three' ? songFour : songOne;
			}}
		/>
		<Library
			libraryOpen={libraryStatus}
			songOne={songOne}
			songTwo={songTwo}
			songThree={songThree}
			songFour={songFour}
			onSelectOne={() => {
				currentSong = songOne;
				playerCommand = isPlaying ? 'load' : 'cue';
				playerCommandVersion++;
				songOne.active = true;
				songTwo.active = false;
				songThree.active = false;
				songFour.active = false;
			}}
			onSelectTwo={() => {
				currentSong = songTwo;
				playerCommand = isPlaying ? 'load' : 'cue';
				playerCommandVersion++;
				songOne.active = false;
				songTwo.active = true;
				songThree.active = false;
				songFour.active = false;
			}}
			onSelectThree={() => {
				currentSong = songThree;
				playerCommand = isPlaying ? 'load' : 'cue';
				playerCommandVersion++;
				songOne.active = false;
				songTwo.active = false;
				songThree.active = true;
				songFour.active = false;
			}}
			onSelectFour={() => {
				currentSong = songFour;
				playerCommand = isPlaying ? 'load' : 'cue';
				playerCommandVersion++;
				songOne.active = false;
				songTwo.active = false;
				songThree.active = false;
				songFour.active = true;
			}}
		/>
		<div class="youtube-disclosure">
			<span>Demo music streams from the visible YouTube embed. This app does not bundle, download, or redistribute audio.</span>
			<a href="https://www.youtube.com/t/terms" rel="noreferrer" target="_blank">YouTube Terms</a>
			<a href="https://policies.google.com/privacy" rel="noreferrer" target="_blank">Google Privacy</a>
		</div>
	</div>
}
