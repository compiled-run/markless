export default function Media() @{
	<div data-page="media">
		<a href="/clip" data-go="clip">Clip</a>
		<video muted src="/tone.wav" data-media="video-src"></video>
		<video muted data-media="video-source"><source src="/tone.wav?source" type="audio/wav" /></video>
		<audio muted src="/tone.wav?audio" data-media="audio-src"></audio>
		<section>
			<video muted src="/tone.wav?nested" data-media="video-nested"></video>
		</section>
		<img src="/dot.png" alt="" data-image="src" />
		<img srcset="/dot.png?srcset 1x" alt="" data-image="srcset" />
		<picture>
			<source srcset="/dot.png?picture" type="image/png" />
			<img src="/dot.png?fallback" alt="" data-image="picture" />
		</picture>
		<iframe src="/frame.html" title="Frame" data-frame-host></iframe>
	</div>
}
