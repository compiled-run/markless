// The front page hero: a mug card's source next to the polaroid it makes.
// Hovering a line in the file highlights the piece of the card that line
// produced, and hovering the state line highlights the number that follows
// it. The heart is a real click on a real state variable, same trick as the
// old counter.
//
// The card is a polaroid photograph (canvas: "Markless Mug Polaroid",
// Option A): white frame taped at the top, the photo window holding the mug
// and the handwritten caption, the heart on the chin. The frame stays white
// in dark mode the way a real print would, so its text is pinned to dark
// ink rather than var(--ink). Shadow color is sampled from the heart
// sticker's baked-in shadow (heart.png bottom-edge average rgb(146 131
// 112)), so CSS surfaces cast the same warm shadow the sticker art does.
//
// Hover state is layered: leaving a child of the photo falls back to
// 'photo', leaving the photo or the heart falls back to 'card', and only
// leaving the card clears — so the highlight degrades outward through the
// nesting the way the code's own nesting reads.
//
// The code panel is hand-marked spans rather than a highlighted fence
// because each line needs its own hover region. Token colours follow the
// fences' convention exactly: shiki's github-light hex as the span's
// `color`, the github-dark hex in `--shiki-dark`, and the `shiki` class on
// the pre so the existing dark-mode rule flips the channel. Formatting is
// safe here: tsrx follows JSX whitespace rules, so oxfmt's reflow of the
// pre's children preserves rendering (meaningful spaces ride as {" "}).
import { state } from "@markless/core";

export default function HeroCard() @{
  let likes = state(0);
  let hot = state("");

  <div class="mug-demo">
    <div class="mug-grid">
      <div class="code">
        <span class="file">mug-card.tsrx</span>
        <pre class="shiki">
          <span class="line">
            <span class="num">1</span>
            <span style="color:#cf222e;--shiki-dark:#ff7b72">import</span>
            {" { "}
            <span style="color:#6639ba;--shiki-dark:#d2a8ff">state</span>
            {" } "}
            <span style="color:#cf222e;--shiki-dark:#ff7b72">from</span>{" "}
            <span style="color:#0a3069;--shiki-dark:#a5d6ff">{"'@markless/core'"}</span>;
          </span>
          <span class="line">
            <span class="num">2</span>{" "}
          </span>
          <span class="line">
            <span class="num">3</span>
            <span style="color:#cf222e;--shiki-dark:#ff7b72">export default function</span>{" "}
            <span style="color:#6639ba;--shiki-dark:#d2a8ff">MugCard</span>
            {"() "}
            <span style="color:#cf222e;--shiki-dark:#ff7b72">{"@{"}</span>
          </span>
          <span
            class={hot === "likes" ? "line hot" : "line"}
            onMouseenter={() => (hot = "likes")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">4</span>
            {"	"}
            <span style="color:#cf222e;--shiki-dark:#ff7b72">let</span>
            {" likes = "}
            <span style="color:#6639ba;--shiki-dark:#d2a8ff">state</span>
            {"(0);"}
          </span>
          <span class="line">
            <span class="num">5</span>{" "}
          </span>
          <span
            class={hot === "card" ? "line hot" : "line"}
            onMouseenter={() => (hot = "card")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">6</span>
            {"	"}
            <span style="color:#116329;--shiki-dark:#7ee787">{"<article>"}</span>
          </span>
          <span
            class={hot === "photo" ? "line hot" : "line"}
            onMouseenter={() => (hot = "photo")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">7</span>
            {"		"}
            <span style="color:#116329;--shiki-dark:#7ee787">{"<div"}</span>{" "}
            <span style="color:#0550ae;--shiki-dark:#79c0ff">class</span>
            {"="}
            <span style="color:#0a3069;--shiki-dark:#a5d6ff">"photo"</span>
            <span style="color:#116329;--shiki-dark:#7ee787">{">"}</span>
          </span>
          <span
            class={hot === "img" ? "line hot" : "line"}
            onMouseenter={() => (hot = "img")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">8</span>
            {"			"}
            <span style="color:#116329;--shiki-dark:#7ee787">{"<img"}</span>{" "}
            <span style="color:#0550ae;--shiki-dark:#79c0ff">src</span>
            {"="}
            <span style="color:#0a3069;--shiki-dark:#a5d6ff">"/mug.png"</span>{" "}
            <span style="color:#116329;--shiki-dark:#7ee787">{"/>"}</span>
          </span>
          <span
            class={hot === "title" ? "line hot" : "line"}
            onMouseenter={() => (hot = "title")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">9</span>
            {"			"}
            <span style="color:#116329;--shiki-dark:#7ee787">{"<h3>"}</span>The Markless mug
            <span style="color:#116329;--shiki-dark:#7ee787">{"</h3>"}</span>
          </span>
          <span
            class={hot === "desc" ? "line hot" : "line"}
            onMouseenter={() => (hot = "desc")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">10</span>
            {"			"}
            <span style="color:#116329;--shiki-dark:#7ee787">{"<p>"}</span>Holds hot takes.
            <span style="color:#116329;--shiki-dark:#7ee787">{"</p>"}</span>
          </span>
          <span
            class={hot === "photo" ? "line hot" : "line"}
            onMouseenter={() => (hot = "photo")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">11</span>
            {"		"}
            <span style="color:#116329;--shiki-dark:#7ee787">{"</div>"}</span>
          </span>
          <span
            class={hot === "button" ? "line hot" : "line"}
            onMouseenter={() => (hot = "button")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">12</span>
            {"		"}
            <span style="color:#116329;--shiki-dark:#7ee787">{"<button"}</span>{" "}
            <span style="color:#0550ae;--shiki-dark:#79c0ff">onClick</span>
            {"={() => likes++}"}
            <span style="color:#116329;--shiki-dark:#7ee787">{">"}</span>
          </span>
          <span
            class={hot === "likes" ? "line hot" : "line"}
            onMouseenter={() => (hot = "likes")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">13</span>
            {"			♥ {likes}"}
          </span>
          <span
            class={hot === "button" ? "line hot" : "line"}
            onMouseenter={() => (hot = "button")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">14</span>
            {"		"}
            <span style="color:#116329;--shiki-dark:#7ee787">{"</button>"}</span>
          </span>
          <span
            class={hot === "card" ? "line hot" : "line"}
            onMouseenter={() => (hot = "card")}
            onMouseleave={() => (hot = "")}
          >
            <span class="num">15</span>
            {"	"}
            <span style="color:#116329;--shiki-dark:#7ee787">{"</article>"}</span>
          </span>
          <span class="line">
            <span class="num">16</span>
            <span style="color:#cf222e;--shiki-dark:#ff7b72">{"}"}</span>
          </span>
        </pre>
      </div>
      <article
        class={hot === "card" ? "hot" : ""}
        onMouseenter={() => (hot = "card")}
        onMouseleave={() => (hot = "")}
      >
        <span class="tape"></span>
        <div
          class={hot === "photo" ? "photo hot" : "photo"}
          onMouseenter={() => (hot = "photo")}
          onMouseleave={() => (hot = "card")}
        >
          <img
            class={hot === "img" ? "mug hot" : "mug"}
            src="/markless/stickers/coffee-mug.png"
            alt="A hand-drawn coffee mug sticker"
            onMouseenter={() => (hot = "img")}
            onMouseleave={() => (hot = "photo")}
          />
          <h3
            class={hot === "title" ? "hot" : ""}
            onMouseenter={() => (hot = "title")}
            onMouseleave={() => (hot = "photo")}
          >
            The Markless mug
          </h3>
          <p
            class={hot === "desc" ? "hot" : ""}
            onMouseenter={() => (hot = "desc")}
            onMouseleave={() => (hot = "photo")}
          >
            Holds hot takes.
          </p>
        </div>
        <button
          class={hot === "button" ? "hot" : ""}
          aria-label="Like the mug"
          onClick={() => {
            likes++;
            hot = "button";
          }}
          onMouseenter={() => (hot = "button")}
          onMouseleave={() => (hot = "card")}
        >
          <img src="/markless/stickers/heart.png" alt="" aria-hidden="true" />
          <span class={hot === "likes" ? "hot" : ""}>{likes}</span>
        </button>
      </article>
    </div>

    <style>
			/* The demo responds to its own slot, not the viewport: .mug-demo
			   is the container, .mug-grid carries the columns (an element
			   cannot query its own width). */
			.mug-demo {
				container-type: inline-size;
				margin-block: var(--space-l);
				/* One cursor for the whole demo: without this the pointer
				   flips default/I-beam/pointer between panel, code text and
				   heart, which reads as glitch rather than affordance. */
				cursor: pointer;
			}

			.mug-grid {
				display: grid;
				grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
				gap: var(--space-m);
				align-items: center;
			}

			/* Container breakpoint, not the old viewport one: the prose
			   column is ~612px, and two columns need roughly 36rem of it. */
			@container (max-width: 36rem) {
				.mug-grid {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			.code {
				position: relative;
			}

			/* The file tab is an accent chip: per the site rule, pastel
			   accents stay light in both themes and carry the dark ink
			   (--on-accent equals --ink in light mode, so light mode is
			   unchanged by using it here). */
			.file {
				position: absolute;
				top: -1rem;
				left: 0.9rem;
				z-index: 1;
				padding: 0.05em 0.7em;
				border: 1px solid color-mix(in oklch, var(--on-accent) 55%, transparent);
				border-radius: 7px;
				/* The mix base is the LIGHT theme's --raised, rebuilt from its
				   global.css recipe (light --paper mixed 80% toward white) so
				   the chip stays light when the theme flips dark. */
				--light-raised: color-mix(in oklch, oklch(91.4% 0.033 79) 80%, white);
				background: color-mix(in oklch, var(--green-soft) 50%, var(--light-raised));
				color: var(--on-accent);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
			}

			pre {
				margin: 0;
				padding: var(--space-s);
				padding-top: calc(var(--space-s) + 0.4rem);
				border: 1px solid rgb(146 131 112 / 0.6);
				border-radius: 8px;
				background: var(--raised);
				box-shadow: -4px 6px 6px rgb(146 131 112 / 0.6);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 160%;
				overflow-x: auto;

				/* The sticker-brown shadow is lighter than a dark ground, so it drops to black. */
				html.dark & {
					box-shadow: -4px 6px 6px rgb(0 0 0 / 0.55);
				}
			}

			.line {
				display: block;
				white-space: pre;
				border-radius: 3px;
				padding-inline: 0.25em;
				transition: background 0.15s ease;
			}

			.num {
				display: inline-block;
				width: 1.9em;
				opacity: 0.4;
				user-select: none;
			}

			/* The polaroid frame. The tape and the photo window are real elements. */
			article {
				position: relative;
				justify-self: center;
				width: min(100%, 15.5rem);
				padding: 0.6rem 0.6rem 0.5rem;
				border: 1px solid #d9cfc0;
				border-radius: 5px;
				background: #fdfbf3;
				color: oklch(28% 0.015 90);
				rotate: 2deg;
				box-shadow:
					-5px 8px 10px rgb(146 131 112 / 0.5),
					0 1px 2px rgb(146 131 112 / 0.35);
				display: flex;
				flex-direction: column;
				text-align: center;

				html.dark & {
					box-shadow:
						-5px 8px 12px rgb(0 0 0 / 0.55),
						0 2px 4px rgb(0 0 0 / 0.45);
				}
			}

			.tape {
				position: absolute;
				top: -0.85rem;
				left: 50%;
				width: 5.5rem;
				height: 1.7rem;
				transform: translateX(-50%) rotate(-4deg);
				/* Mix base is the LIGHT theme's --paper, written out, so the
				   tape keeps its light-mode washi green in both themes. */
				background: color-mix(in oklch, var(--green-star) 55%, oklch(91.4% 0.033 79));
				opacity: 0.95;
				border: 1px solid rgba(51, 48, 42, 0.22);
				z-index: 2;
			}

			/* The photo window: the print inside the frame, holding the mug
			   and the handwritten caption. Its cream stays fixed in dark mode
			   the way a printed photo would. */
			.photo {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.55rem;
				padding: 1.2rem 0.8rem 1rem;
				background: #f4ebd9;
				border: 1px solid rgba(70, 63, 52, 0.25);
				border-radius: 2px;
				transition: background 0.15s ease;
			}

			.mug {
				width: 88%;
				height: auto;
				border-radius: 3px;
				transition: background 0.15s ease;
			}

			article h3 {
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 1.3rem;
				white-space: nowrap;
				line-height: 115%;
				/* Pinned with !important: the global dark-theme heading rules
				   would paint this in the theme's ink — near-white — on a
				   frame that stays white in dark mode. */
				color: oklch(28% 0.015 90) !important;
				text-shadow: none;
				padding-inline: 0.2em;
			}

			article p {
				margin: 0;
				font-size: var(--step--1);
				color: rgba(51, 48, 42, 0.8);
			}

			button {
				display: flex;
				align-items: center;
				gap: 0.35em;
				align-self: flex-start;
				margin-top: 0.45rem;
				margin-left: 0.15rem;
				padding: 0.15em 0.5em;
				border: none;
				border-radius: 6px;
				background: transparent;
				color: oklch(28% 0.015 90);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
			}

			/* The button's children are transparent to hit-testing: the
			   :active scale shrinks the heart under the cursor, and if the
			   img is its own hover target that fires a boundary crossing the
			   delegated events resolve as a button leave — the highlight
			   then flickers button/card on every click without the mouse
			   moving. With pointer-events: none the button is the only
			   boundary. */
			button img,
			button span {
				pointer-events: none;
			}

			button img {
				width: 1.9rem;
				transition: transform 0.12s ease;
			}

			button:hover img {
				transform: scale(1.12) rotate(-4deg);
			}

			button:active img {
				transform: scale(0.9);
			}

			/* Forgiving hover targets: block padding so the highlight zones
			   are rows, not just the glyphs. */
			h3,
			article p,
			button,
			button span {
				border-radius: 3px;
				padding-inline: 0.4em;
				padding-block: 0.12em;
				transition: background 0.15s ease;
			}

			.hot {
				background: color-mix(in oklch, var(--yellow) 45%, transparent);
			}

			/* The whole-card highlight tints the frame toward yellow instead
			   of flooding it translucent, so the polaroid stays a polaroid. */
			article.hot {
				background: color-mix(in oklch, var(--yellow) 30%, #fdfbf3);
			}
		</style>
  </div>;
}
