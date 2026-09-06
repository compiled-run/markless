// The live music player on the first-app page. It lives in a component
// because the MDX pipeline only mounts .tsrx components, never raw block
// HTML, so an <iframe> cannot sit in the .mdx file directly.
//
// The frame serves the prerendered static build copied into
// public/demos/music-player/ (source: demos/music-player in the monorepo,
// rebuilt with --base=/markless/demos/music-player/). The ?markless-log query
// turns on the execution ledger off localhost, so the console receipt the
// page dares readers to open also prints on the deployed site.
//
// Styles are inline because scoped <style> CSS compiles but never links on
// the pinned 0.3.1 build (NOTES.md finding 26), and one element is not worth
// a global.css shim.
export default function MusicPlayerFrame() @{
	<iframe
		src="/markless/demos/music-player/?markless-log"
		title="Waves, a Markless music player"
		loading="lazy"
		style="width:100%;height:640px;border:2px solid var(--ink);border-radius:10px;background:#0d0f12;"
	></iframe>
}
