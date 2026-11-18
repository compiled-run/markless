package dev.markless.mobile.view

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ScrollView
import dev.markless.mobile.core.FOCUS_INTO_VIEW
import dev.markless.mobile.core.Payload
import kotlin.math.roundToInt

/** An Activity that shows one Markless component: override [payloadBytes], and [styleExportBytes] to apply Dragon's styles. */
abstract class MarklessActivity : Activity() {
	lateinit var host: MarklessHost
		private set

	abstract fun payloadBytes(): ByteArray

	open fun styleExportBytes(): ByteArray? = null

	/** The path the app opens at (`/apple`); the Maestro launch argument `route` arrives as this intent extra. */
	open fun route(): String? = intent.getStringExtra("route")

	/** The params of [route], matched against the payload's route pattern; no route opens a page whose pattern has no params. */
	private fun launchParams(payload: ByteArray): Map<String, String> {
		val route = Payload.decode(payload).route
		val path = route() ?: if (route == null || route.params.isEmpty()) return emptyMap() else throw MarklessHostError("launched with no route; this payload is the page at ${route.pattern}")
		if (route == null) throw MarklessHostError("launched at $path, but the payload is not a page")
		return route.match(path) ?: throw MarklessHostError("launched at $path, which does not match ${route.pattern}")
	}

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		open(launchParams(payloadBytes()))
	}

	/** Builds the page from scratch with [params]: one page per payload, so a link names this page's own route. */
	private fun open(params: Map<String, String>) {
		val bytes = payloadBytes()
		host = MarklessHost(this, bytes, styleExportBytes(), params = params)
		host.onNavigate = { route, next ->
			if (route != host.payload.route?.pattern) throw MarklessHostError("navigate to $route; this app holds only ${host.payload.route?.pattern}")
			open(next)
		}
		// The page's own scroll view, as a browser's viewport: its content starts inside the system bars and scrolls under them.
		val page = ScrollView(this).apply { isFillViewport = true; clipToPadding = false }
		val content = object : FrameLayout(this) {
			override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
				val f = host.rootFrame
				if (f == null) super.onLayout(changed, left, top, right, bottom)
				else host.root.layout(f.left, f.top, f.right, f.bottom)
			}

			override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
				val f = host.rootFrame
				val size = host.pageSize()
				if (f == null || size == null) return super.onMeasure(widthMeasureSpec, heightMeasureSpec)
				host.root.measure(MeasureSpec.makeMeasureSpec(f.width(), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(f.height(), MeasureSpec.EXACTLY))
				setMeasuredDimension(maxOf(size.first, MeasureSpec.getSize(widthMeasureSpec)), size.second)
			}
		}
		page.setOnApplyWindowInsetsListener { v, insets ->
			val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
			val keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom
			// The keyboard takes the bottom of the screen, as it shrinks a phone browser's viewport; the page ends above it.
			v.setPadding(bars.left, bars.top, bars.right, if (keyboard > 0) 0 else bars.bottom)
			(v.layoutParams as FrameLayout.LayoutParams).let { lp -> if (lp.bottomMargin != keyboard) { lp.bottomMargin = keyboard; v.layoutParams = lp } }
			insets
		}
		// As a phone browser does once the keyboard is up: the focused field is scrolled into what the keyboard leaves shown.
		page.addOnLayoutChangeListener { _, _, _, _, bottom, _, _, _, oldBottom -> if (bottom != oldBottom) host.focusedField()?.let { host.bringIntoView(it, FOCUS_INTO_VIEW) } }
		content.addView(host.root, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
		page.addView(content, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
		setContentView(FrameLayout(this).apply { addView(page, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)) })
		if (host.style != null) page.post { android.util.Log.i(MarklessHost.TAG, "frames max gap ${host.frameDeviation()} device px") }
	}

	fun contentRoot(): View = host.root
}
