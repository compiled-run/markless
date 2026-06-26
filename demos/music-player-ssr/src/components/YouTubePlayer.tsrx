export function YouTubePlayer({
	isPlaying,
	playerCommand,
	playerCommandVersion,
	track,
}) @{
	<div class="youtube-player">
		<div
			class="youtube-frame-host"
			data-video-id={track.videoId}
			data-playing={isPlaying}
			data-command={playerCommand}
			data-command-version={playerCommandVersion}
		>
			<div class="youtube-player-target"></div>
		</div>
	</div>
}
