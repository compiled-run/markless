export default function Banner() @{
	<div class="banner" data-banner>
		<strong>{'Release notes'}</strong>
		<span>{' are out for the new version, with a long line every page repeats.'}</span>
		<button type="button" data-banner-press onClick={() => {
			const host = globalThis as { __bannerPresses?: number };
			host.__bannerPresses = (host.__bannerPresses ?? 0) + 1;
		}}>{'Mark read'}</button>
		<ul class="releases">
			<li><a href="/releases/8.0" class="release-link">{'Version 8.0 release notes'}</a></li>
			<li><a href="/releases/7.3" class="release-link">{'Version 7.3 release notes'}</a></li>
			<li><a href="/releases/7.2" class="release-link">{'Version 7.2 release notes'}</a></li>
			<li><a href="/releases/7.1" class="release-link">{'Version 7.1 release notes'}</a></li>
			<li><a href="/releases/7.0" class="release-link">{'Version 7.0 release notes'}</a></li>
			<li><a href="/releases/6.4" class="release-link">{'Version 6.4 release notes'}</a></li>
			<li><a href="/releases/6.3" class="release-link">{'Version 6.3 release notes'}</a></li>
			<li><a href="/releases/6.2" class="release-link">{'Version 6.2 release notes'}</a></li>
		</ul>
	</div>
}
