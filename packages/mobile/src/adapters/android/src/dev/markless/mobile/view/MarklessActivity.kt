package dev.markless.mobile.view

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.os.SystemClock
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.ContextThemeWrapper
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.EditText
import android.widget.FrameLayout
import dev.markless.mobile.core.AppPayload
import dev.markless.mobile.core.FOCUS_INTO_VIEW
import dev.markless.mobile.core.Payload
import dev.markless.mobile.style.StyleExport
import kotlin.math.roundToInt

/**
 * An Activity that shows one Markless component: override [payloadBytes], and [styleExportBytes] to apply Dragon's styles
 * (a page's own export, or for an app payload the app's `markless.native-app-style/0` file).
 * For an app payload (`markless.native-app/0`) each instance is one screen of the task's back stack: links start the next
 * screen's activity, and the system back button and gesture finish this one, so the screen below shows as it was left.
 */
abstract class MarklessActivity : Activity() {
	lateinit var host: MarklessHost
		private set

	abstract fun payloadBytes(): ByteArray

	open fun styleExportBytes(): ByteArray? = null

	/** Whether a screen whose page has a script starts the engine once its first frame is up and the main loop is idle. */
	open val warmsScriptEngine: Boolean get() = true

	override fun onDestroy() {
		if (::host.isInitialized) host.stopTimersAndRequests()
		super.onDestroy()
	}

	/** Where device values come from and device calls go; the phone's own by default. */
	open val device: NativeDevice by lazy { PlatformDevice(this) }

	override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
		super.onRequestPermissionsResult(requestCode, permissions, grantResults)
		device.permissionsAnswered(requestCode)
	}

	override fun onResume() {
		super.onResume()
		device.resumed()
	}

	override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
		super.onActivityResult(requestCode, resultCode, data)
		device.activityResult(requestCode)
	}

	/** The path this screen opens at: the `route` extra (Maestro's launch argument, or a link), or a deep link's path. */
	open fun route(): String? = intent.getStringExtra(ROUTE) ?: intent.data?.takeIf { it.host == APP_LINK_HOST }?.path

	/** How deep this screen sits in the stack; the bottom screen has no Up arrow. */
	private val depth get() = intent.getIntExtra(DEPTH, 0)

	/** The params of [route], matched against the payload's route pattern; no route opens a page whose pattern has no params. */
	private fun launchParams(payload: ByteArray): Map<String, String> {
		val route = Payload.decode(payload).route
		val path = route() ?: if (route == null || route.params.isEmpty()) return emptyMap() else throw MarklessHostError("launched with no route; this payload is the page at ${route.pattern}")
		if (route == null) throw MarklessHostError("launched at $path, but the payload is not a page")
		return route.match(path) ?: throw MarklessHostError("launched at $path, which does not match ${route.pattern}")
	}

	/** When this screen's onCreate began, on the uptime clock the process start time is read on. */
	private var createdAt = 0L

	override fun onCreate(savedInstanceState: Bundle?) {
		createdAt = SystemClock.uptimeMillis()
		val bytes = payloadBytes()
		val app = AppPayload.decodeOrNull(bytes)
		if (app == null) {
			super.onCreate(savedInstanceState)
			open(launchParams(bytes))
			return
		}
		isApp = true
		setTheme(APP_THEME)
		super.onCreate(savedInstanceState)
		followAppearance(resources.configuration)
		val path = route() ?: "/"
		val stack = app.backStack(path)
		if (!intent.hasExtra(DEPTH) && stack.size > 1) {
			val screens = stack.mapIndexed { index, prefix -> screen(prefix, index) }
			screens[0].addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
			startActivities(screens.toTypedArray())
			finish()
			overridePendingTransition(0, 0)
			return
		}
		val (route, params) = app.match(path) ?: throw MarklessHostError("$path is not a route of this app")
		val styles = styleExportBytes()?.let { StyleExport.decodeApp(it) } ?: emptyMap()
		for (pattern in styles.keys) if (app.routes.none { it.route.pattern == pattern }) throw MarklessHostError("the app style has styles for $pattern, which is not a route of this app")
		show(MarklessHost(this, route.page, styles[route.route.pattern], params = params, device = device))
		title = host.runtime.title() ?: ""
		host.onTitle = { title = it }
		host.onNavigate = { entry ->
			startActivity(screen(AppPayload.path(entry.route, entry.params), if (entry.replace) depth else depth + 1))
			if (entry.replace) finish()
		}
		actionBar?.setDisplayHomeAsUpEnabled(depth > 0)
	}

	override fun onConfigurationChanged(newConfig: Configuration) {
		super.onConfigurationChanged(newConfig)
		if (isApp) followAppearance(newConfig)
		if (::host.isInitialized) host.configurationChanged(newConfig)
	}

	override fun onOptionsItemSelected(item: MenuItem): Boolean {
		if (item.itemId != android.R.id.home) return super.onOptionsItemSelected(item)
		finish()
		return true
	}

	/** An app payload's screen, which has an action bar; a single page has none. */
	private var isApp = false

	/** The text colour of the action bar in the current appearance; null outside an app. */
	private var barText: Int? = null

	/**
	 * The action bar and status bar icons follow the appearance as iOS's bar does. The activity handles uiMode itself (a rebuild
	 * would lose the page's state), so the theme's bar colours are read again from the new configuration and set by hand.
	 */
	private fun followAppearance(configuration: Configuration) {
		val themed = ContextThemeWrapper(createConfigurationContext(configuration), APP_THEME)
		val colors = themed.obtainStyledAttributes(intArrayOf(android.R.attr.colorPrimary, android.R.attr.textColorPrimary))
		val bar = colors.getColor(0, 0)
		val text = colors.getColor(1, 0)
		colors.recycle()
		barText = text
		actionBar?.setBackgroundDrawable(ColorDrawable(bar))
		actionBar?.setHomeAsUpIndicator(themed.obtainStyledAttributes(intArrayOf(android.R.attr.homeAsUpIndicator)).let { a ->
			a.getDrawable(0)?.mutate()?.apply { setTint(text) }.also { a.recycle() }
		})
		title = title
		val light = !isDark(configuration)
		if (Build.VERSION.SDK_INT >= 30) window.insetsController?.setSystemBarsAppearance(
			if (light) WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS else 0,
			WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
		)
	}

	override fun onTitleChanged(title: CharSequence?, color: Int) {
		val text = barText
		if (title == null || text == null) return super.onTitleChanged(title, color)
		val tinted = SpannableString(title.toString())
		tinted.setSpan(ForegroundColorSpan(text), 0, tinted.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
		super.onTitleChanged(tinted, color)
	}

	private fun screen(path: String, depth: Int) = Intent(this, javaClass).putExtra(ROUTE, path).putExtra(DEPTH, depth)

	/** Builds the page from scratch with [params]: one page per payload, so a link names this page's own route. */
	private fun open(params: Map<String, String>) {
		if (::host.isInitialized) host.release()
		show(MarklessHost(this, payloadBytes(), styleExportBytes(), params = params, device = device))
		host.onNavigate = { entry ->
			if (entry.route != host.payload.route?.pattern) throw MarklessHostError("navigate to ${entry.route}; this app holds only ${host.payload.route?.pattern}")
			open(entry.params)
		}
	}

	private fun show(next: MarklessHost) {
		host = next
		// The page's own scroll view, as a browser's viewport: its content starts inside the system bars and scrolls under them.
		val page = PageScrollView(this).apply { isFillViewport = true; clipToPadding = false; onTake = next::scrollTookTouches }
		val content = object : FrameLayout(this) {
			override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
				val f = host.rootFrame
				if (f == null) super.onLayout(changed, left, top, right, bottom)
				else host.root.layout(f.left, f.top, f.right, f.bottom)
			}

			private val bodyPaint = android.graphics.Paint()

			// body's own background, under the page, where the assignment gives it one.
			override fun dispatchDraw(canvas: android.graphics.Canvas) {
				host.bodyBox?.let { (rect, color) ->
					bodyPaint.color = color
					canvas.drawRect((paddingLeft + rect.left).toFloat(), (paddingTop + rect.top).toFloat(), (paddingLeft + rect.right).toFloat(), (paddingTop + rect.bottom).toFloat(), bodyPaint)
				}
				super.dispatchDraw(canvas)
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
		host.canvasColor?.let(page::setBackgroundColor)
		host.onCanvas = { color ->
			page.setBackgroundColor(color)
			content.invalidate()
		}
		setContentView(FrameLayout(this).apply { addView(page, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)) })
		if (!firstFrameLogged) logFirstFrame(page)
		if (warmsScriptEngine) host.warmScriptWhenIdle()
		if (host.style != null) page.post { android.util.Log.i(MarklessHost.TAG, "frames max gap ${host.frameDeviation()} device px") }
	}

	private var firstFrameLogged = false

	/** Logs `first frame <ms> ms` when the page first draws: from this screen's onCreate, and from the process start. */
	private fun logFirstFrame(page: View) {
		firstFrameLogged = true
		val drawn = object : ViewTreeObserver.OnDrawListener {
			var seen = false
			override fun onDraw() {
				if (seen) return
				seen = true
				val now = SystemClock.uptimeMillis()
				android.util.Log.i(MarklessHost.TAG, "first frame ${now - createdAt} ms from onCreate, ${now - Process.getStartUptimeMillis()} ms from process start")
				// A draw listener cannot remove itself while the draw runs.
				page.post { page.viewTreeObserver.takeIf { it.isAlive }?.removeOnDrawListener(this) }
			}
		}
		page.viewTreeObserver.addOnDrawListener(drawn)
	}

	fun contentRoot(): View = host.root

	// Pointer events reach the runtime before the views, so a press is reported before the click it ends in.
	override fun dispatchTouchEvent(event: MotionEvent): Boolean {
		if (::host.isInitialized) host.touch(event)
		return super.dispatchTouchEvent(event)
	}

	companion object {
		/** The system's own theme, light or dark with the device. */
		private val APP_THEME = if (Build.VERSION.SDK_INT >= 29) android.R.style.Theme_DeviceDefault_DayNight else android.R.style.Theme_Material_Light
		const val ROUTE = "route"
		const val DEPTH = "markless.depth"
		/** A deep link's host: `markless-proof://app/<path>`; a test build's device links use another. */
		const val APP_LINK_HOST = "app"
	}
}
