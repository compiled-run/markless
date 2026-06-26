import { YouTubePlayer } from './YouTubePlayer.tsrx';

export function Song({ currentSong, isPlaying, playerCommand, playerCommandVersion }) @{
	<div class="song-container">
		<div class="mini-video-shell">
			<YouTubePlayer
				isPlaying={isPlaying}
				playerCommand={playerCommand}
				playerCommandVersion={playerCommandVersion}
				track={currentSong}
			/>
		</div>
		<div class={isPlaying ? 'record rotating' : 'record'}>
			<span class="record-shine"></span>
			<span class="record-marker record-marker-one"></span>
			<span class="record-marker record-marker-two"></span>
			<span class="record-label">
				<img alt={currentSong.name} src={currentSong.cover} />
			</span>
			<span class="record-center"></span>
		</div>
		<h2>{currentSong.name}</h2>
		<h3>{currentSong.artist}</h3>
	</div>
}
