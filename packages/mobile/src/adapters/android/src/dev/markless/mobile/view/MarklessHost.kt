package dev.markless.mobile.view

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.view.WindowInsets
import android.widget.FrameLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.LocaleList
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.inputmethod.EditorInfo
import android.text.Editable
import android.text.InputType
import android.text.InputFilter
import android.text.Spanned
import android.text.TextWatcher
import android.widget.Button
import android.widget.CheckBox
import android.widget.CompoundButton
import android.widget.RadioButton
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.ScrollView
import android.widget.TextView
import dev.markless.mobile.core.MemoryStore
import dev.markless.mobile.core.ScrollAlignment
import dev.markless.mobile.core.ScrollBox
import dev.markless.mobile.core.ScrollRange
import dev.markless.mobile.core.ScrollRect
import dev.markless.mobile.core.nativeMaxLength
import dev.markless.mobile.core.nativeRangeValue
import dev.markless.mobile.core.scrollIntoView
import dev.markless.mobile.core.ElementBox
import dev.markless.mobile.core.EventName
import dev.markless.mobile.core.Instance
import dev.markless.mobile.core.JournalEntry
import dev.markless.mobile.core.JsValue
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.OVERLAY_ATTRIBUTE
import dev.markless.mobile.core.Payload
import dev.markless.mobile.core.Runtime
import dev.markless.mobile.core.Scope
import dev.markless.mobile.core.Store
import dev.markless.mobile.style.Assignment
import dev.markless.mobile.style.BAND_KEY
import dev.markless.mobile.style.StyleExport
import dev.markless.mobile.style.shownRows
import dev.markless.mobile.style.rowStates
import dev.markless.mobile.style.StyleWrite
import dev.markless.mobile.style.StyledNode
import kotlin.math.roundToInt

class MarklessHostError(message: String) : RuntimeException(message)

internal fun isDark(configuration: Configuration): Boolean =
	configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES

/** Looks up a font face by the id a style export names it with (`sha256:<hex>` of the font file). */
fun interface FontSource {
	fun typeface(id: String): Typeface

	/** The face as a [android.graphics.fonts.Font], which draws a style export's glyph ids. */
	fun font(id: String): android.graphics.fonts.Font = throw MarklessHostError("this font source has no glyph font for \"$id\"")
}

/** Faces bundled as APK assets at `markless-fonts/<hex>.ttf`, the hex of the font file's SHA-256. */
class AssetFonts(private val context: Context) : FontSource {
	private val cache = HashMap<String, Typeface>()
	override fun typeface(id: String): Typeface = cache.getOrPut(id) {
		Typeface.createFromAsset(context.assets, path(id))
	}
	private val faces = HashMap<String, android.graphics.fonts.Font>()
	override fun font(id: String): android.graphics.fonts.Font = faces.getOrPut(id) { android.graphics.fonts.Font.Builder(context.assets, path(id)).build() }

	private fun path(id: String): String {
		if (!id.startsWith("sha256:")) throw MarklessHostError("font id \"$id\" is not a sha256 id")
		return "markless-fonts/${id.removePrefix("sha256:")}.ttf"
	}
}

/**
 * The system faces a style export names, each `/system/fonts/<file>` at the axes Dragon measured it at, drawn by the platform's
 * own font; any other id goes to [bundled].
 */
class SystemFonts(private val faces: Map<String, dev.markless.mobile.style.SystemFace>, private val bundled: FontSource) : FontSource {
	private val fonts = HashMap<String, android.graphics.fonts.Font>()
	private val typefaces = HashMap<String, Typeface>()

	override fun font(id: String): android.graphics.fonts.Font {
		val face = faces[id] ?: return bundled.font(id)
		return fonts.getOrPut(id) {
			val file = java.io.File("/system/fonts", face.file)
			try {
				android.graphics.fonts.Font.Builder(file).setTtcIndex(face.index)
					.setFontVariationSettings(face.axes.entries.joinToString(", ") { "'${it.key}' ${it.value}" }).build()
			} catch (e: java.io.IOException) {
				throw MarklessHostError("system face $id: ${file.path} could not be read (${e.message})")
			}
		}
	}

	override fun typeface(id: String): Typeface {
		if (id !in faces) return bundled.typeface(id)
		return typefaces.getOrPut(id) { Typeface.CustomFallbackBuilder(android.graphics.fonts.FontFamily.Builder(font(id)).build()).build() }
	}
}

/**
 * Builds the retained views for one payload and keeps them current. After [root] is built, views change only through
 * journal entries from the [runtime]. Pass the Dragon style export to place and paint the views; without it children stack.
 */
class MarklessHost(
	private val context: Context,
	val payload: Payload,
	/** This page's styles: a page's own export, or its route's styles from an app style file. */
	style: StyleExport?,
	bundledFonts: FontSource = AssetFonts(context),
	store: Store = PreferencesStore(context),
	/** The route params the page opens with. */
	params: Map<String, String> = emptyMap(),
	/** Where device values come from and device calls go; required for a payload that names device features. */
	private val device: NativeDevice? = null,
	/** The device's preferred languages, most preferred first, for the web's own messages. */
	preferredLanguages: List<String> = LocaleList.getDefault().let { list -> (0 until list.size()).map { list[it].toLanguageTag() } },
	/** The device's clock, in ms since 1970 (UTC); a conformance run fixes it. */
	now: () -> Double = { System.currentTimeMillis().toDouble() },
) {
	constructor(
		context: Context,
		payloadBytes: ByteArray,
		styleExportBytes: ByteArray? = null,
		fonts: FontSource = AssetFonts(context),
		store: Store = PreferencesStore(context),
		params: Map<String, String> = emptyMap(),
		device: NativeDevice? = null,
		preferredLanguages: List<String> = LocaleList.getDefault().let { list -> (0 until list.size()).map { list[it].toLanguageTag() } },
	) : this(context, Payload.decode(payloadBytes), styleExportBytes?.let { StyleExport.decode(it) }, fonts, store, params, device, preferredLanguages)

	/** This page's styles, laid out at the page's own size once [layOutAt] has run with Dragon's plan. */
	var style: StyleExport? = style
		private set
	/** The export as built, which Dragon's plan lays out again at each size. */
	private val planned = style
	/** Dragon's HarfBuzz over this phone's system fonts, made when a page first lays its rows out. */
	private var rowShaper: RowShaper? = null
	/** The page size in device px and the slot values (export order) the page was last laid out at. */
	private var laidOutFor: Triple<Int, Int, List<Double>>? = null
	private val fonts: FontSource = if (style?.systemFaces.isNullOrEmpty()) bundledFonts else SystemFonts(style!!.systemFaces, bundledFonts)
	val runtime = Runtime(payload, store, params, preferredLanguages, now, AppScriptEngine).apply {
		onScriptLog = { level, text -> Log.i(AppScriptEngine.TAG, "$level: $text") }
		onScriptEntry = AppScriptEngine::entryRan
		measure = this@MarklessHost::measureBox
	}
	/** Each style slot's current value, from the runtime at mount and then its `slot` entries. */
	private val slotValues = HashMap(runtime.slots().toMap()).also { values ->
		val slots = style?.slots.orEmpty()
		if (slots.isNotEmpty() && planLayout == null) throw MarklessHostError("style values that follow state need Dragon's layout plan, which this host does not link")
		val integer = payload.slots.associate { it.id to it.integer }
		val rowSlots = payload.slots.filter { it.row != null }.map { it.id }.toSet()
		for (s in slots) {
			// A slot inside a row has a value per row copy, which the rows carry; the page lays its template out at the first value.
			if (s.id in rowSlots) values.putIfAbsent(s.id, s.initial)
			if (s.id !in values) throw MarklessHostError("style export reads slot \"${s.id}\", which the payload does not have")
			if (s.integer && integer[s.id] != true) throw MarklessHostError("style export laid slot \"${s.id}\" out at whole numbers only, but the payload's slot may take any number")
		}
	}
	private val scriptServices = ScriptServices()
	private val order = payload.nodes.withIndex().associate { it.value.id to it.index }
	private val events = payload.events.groupBy { it.host }
	private val views = HashMap<String, View>()
	private val built = HashMap<String, Instance>()
	/** Shapes inside an svg, by instance: the drawing that draws each one. */
	private val shapeOwners = HashMap<String, DrawingView>()
	/** svgs whose viewBox follows state: the journal's `viewBox` attribute gives it. */
	private val followingViewBox = HashSet<String>()
	private val textViews = HashMap<String, TextView>()
	/** Each text view that draws Dragon's glyph lines over itself instead of its own text. */
	private val glyphLines = HashMap<TextView, GlyphLines>()
	/** Each styled text view's node and its frame origin inside the view, for drawing its lines again when its text changes. */
	private val lineSources = HashMap<TextView, Pair<StyledNode, Pair<Double, Double>>>()
	/** Without a style export, text flows in paragraphs (one text view each); with one, Dragon lays out every text node. */
	private val flow: TextFlow? = if (style == null) TextFlow(payload) else null
	/** Each shown text instance's current string, which its paragraph view is rendered from. */
	private val heldTexts = HashMap<String, String>()
	/** Shown instances that are part of a paragraph without being its first node: they have no view of their own. */
	private val members = HashSet<String>()
	/** The page's own box when its top holds more than one node (text at the top of the page). */
	private val pageBox: MarklessBox?
	private val baseTextSize = TextView(context).textSize
	private val expanded = HashMap<View, Boolean?>()
	private val sheets = LinkedHashMap<String, SystemSheet>()
	/** The sheets shown at the last journal: one whose arm leaves closes, one whose arm comes while open opens. */
	private var shownSheets: Set<String> = emptySet()
	/** Each view's current attributes, for the relations and roles the accessibility delegate reports. */
	private val attrs = HashMap<String, HashMap<String, String>>()
	/** Each scroll container's scroll views (outermost first) and the content box its children sit in. */
	private val scrollers = HashMap<String, Pair<List<FrameLayout>, MarklessBox>>()
	private val dpr = context.resources.displayMetrics.density.toDouble()
	private var enterPressedAt = Long.MIN_VALUE / 2
	// A style case is a state of the export as a styled cell is; the runtime answers its value.
	private val styledCells = payload.cells.filter { it.styled }.map { it.id } + payload.styleCases.map { it.id }
	/** Each @if or @try outside list rows: its style state is the arm it shows. */
	private val styledBranches = payload.nodes.filter { it is Node.Branch && it.row == null }.map { it.id }

	/** One laid-out document (the page, or a sheet's content at one resting height) and the assignment it shows. */
	private inner class Layout(export: StyleExport, everyCell: Boolean) {
		var export = export
			private set
		var assignment = export.start(styledCells, runtime::value, isDark(context.resources.configuration), everyCell, styledBranches, runtime::styleArm, export.rowStates(payload))
		var absolutes: List<Map<String, Pair<Double, Double>>> = export.assignments.map { a -> absoluteOrigins(a.nodes) }
			private set

		init {
			if ((export.plan == null || planLayout == null) && Math.abs(dpr - export.dpr) > 1e-3) throw MarklessHostError("style export is for pixel ratio ${export.dpr}; this device is $dpr")
		}

		/** The same document laid out at another size: the same assignments, new geometry. */
		fun relaid(next: StyleExport) {
			export = next
			absolutes = next.assignments.map { a -> absoluteOrigins(a.nodes) }
		}

		/** Moves to the assignment [cell] = [value] reaches; false when no state of this document follows [cell]. */
		fun advance(cell: String, value: JsValue): Boolean {
			val state = if (cell == BAND_KEY) export.bandState else export.stateOrNone(cell)
			if (state < 0) return false
			assignment = export.next(assignment, state, value)
			return true
		}

		/** The bottom edge of its lowest box, in device px from the document's top. */
		fun contentBottom(): Double = export.assignments[assignment].nodes.maxOf { n -> (absolutes[assignment][n.id]?.second ?: 0.0) + (n.frame?.height ?: 0.0) }
	}

	private val page: Layout? = style?.let { Layout(it, everyCell = true) }

	/** The system sheet whose content each payload node is, if any. */
	private val sheetOf: Map<String, String?> = HashMap<String, String?>().apply {
		val byId = payload.nodes.associateBy { it.id }
		for (n in payload.nodes) {
			var at = n.parent
			while (at != null && byId[at] !is Node.Sheet) at = byId[at]?.parent
			put(n.id, at)
		}
	}

	/** Each styled sheet's layouts, in its snap point order, and the one its resting height shows. */
	private class SheetLayouts(val snapPoints: List<Double>, val layouts: List<Layout>) {
		var current = 0
		var warned = false
	}
	private val sheetLayouts = LinkedHashMap<String, SheetLayouts>()

	private fun sheetLayout(id: String): Layout? = sheetLayouts[id]?.let { it.layouts[it.current] }

	private fun layoutOf(node: Node): Layout? = sheetOf[node.id]?.let { sheetLayout(it) } ?: page

	private fun allLayouts(): List<Layout> = listOfNotNull(page) + sheetLayouts.values.flatMap { it.layouts }

	private val overlays = Overlays(this, context, dpr)

	/** The root's frame inside the viewport, when a style export placed it. */
	var rootFrame: Rect? = null
		private set

	/** Opens the page a `navigate` entry names; required for a payload with links. */
	var onNavigate: ((JournalEntry.Navigate) -> Unit)? = null

	/** Shows the page's new title; required for a payload with a title that follows state. */
	var onTitle: ((String) -> Unit)? = null

	/** Called with each journal after it is applied. */
	var onJournal: ((List<JournalEntry>) -> Unit)? = null

	private val timers = Handler(Looper.getMainLooper())

	/** Runs a `timer` entry's action after its delay; by default on the main looper, applying its journal. */
	var scheduleTimer: (timer: String, ms: Double) -> Unit = { timer, ms ->
		if (ms.isFinite()) {
			val due = Runnable {
				pendingTimers.remove(timer)
				if (!released) apply(runtime.timer(timer))
			}
			pendingTimers.put(timer, due)?.let(timers::removeCallbacks)
			timers.postDelayed(due, ms.toLong())
		}
	}

	/** Each scheduled timer's runnable by timer id, so a `clearTimer` entry can drop it. */
	private val pendingTimers = HashMap<String, Runnable>()

	/** Inputs with no visible view (a checkbox or hidden input): GONE and outside the accessibility tree. */
	private val inert = HashSet<String>()

	/** The layer showing an `invalid` entry's message until the next action. */
	private var message: View? = null

	val root: View

	init {
		val single = (payload.nodes.firstOrNull() as? Node.Element)?.takeIf { it.parent == null && it.arm == null && payload.nodes.count { n -> n.parent == null } == 1 }
		if (single == null && style != null) throw MarklessHostError("a styled payload must start with its one root element")
		if (single == null && payload.nodes.isEmpty()) throw MarklessHostError("payload has no nodes")
		pageBox = if (single == null) MarklessBox(context) else null
		for (sheet in payload.nodes.filterIsInstance<Node.Sheet>()) {
			if (sheet.dismissible && runtime.handlerFor(sheet.id, EventName.Dismiss) == null) throw MarklessHostError("\"${sheet.id}\" is dismissible but has no dismiss handler")
			val content = MarklessBox(context).apply { named(this, sheet.id) }
			views[sheet.id] = content
			style?.let { st ->
				sheetLayouts[sheet.id] = SheetLayouts(sheet.snapPoints, st.sheetHeights(sheet.id, sheet.snapPoints).map { Layout(it, everyCell = false) })
				content.setBackgroundColor(android.graphics.Color.WHITE)
			}
			sheets[sheet.id] = SystemSheet(context, sheet, content, onRest = { snapPoint, width, height -> rested(sheet.id, snapPoint, width, height) }) { closedByPlatform(sheet.id) }
		}
		for (cell in payload.cells) cell.device?.let { runtime.device(cell.id, needDevice().read(it, cell.obj)) }
		buildShown()
		refreshMarkers()
		root = pageBox ?: views.getValue(single!!.id)
		syncSheets()
		for (cell in payload.cells) cell.device?.let { name -> needDevice().watch(name, cell.obj) { if (!released) apply(runtime.device(cell.id, it)) } }
		for (call in runtime.tasks()) runCall(call)
		// The activity reads the title after building the host, so a start that retitles needs no title bar yet.
		apply(runtime.start().filter { it !is JournalEntry.Title || onTitle != null })
		refreshRelations()
		refreshSelects()
		root.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
			override fun onViewAttachedToWindow(view: View) = startLoadEvents()
			override fun onViewDetachedFromWindow(view: View) = stopLoadEvents()
		})
		if (runtime.overlays().isNotEmpty()) root.post { overlays.mount() }
	}

	private val onLayout = android.view.ViewTreeObserver.OnGlobalLayoutListener { raiseVisible() }
	private val onScroll = android.view.ViewTreeObserver.OnScrollChangedListener { raiseVisible() }
	private var drawn = false
	private var idleQueued = false
	private var raisingVisible = false

	/** `idle` waits for the first frame, then for the main thread's queue to go idle, as the web waits for an idle period after load. */
	private fun startLoadEvents() {
		root.viewTreeObserver.addOnGlobalLayoutListener(onLayout)
		root.viewTreeObserver.addOnScrollChangedListener(onScroll)
		if (drawn) return scheduleLoadEvents()
		root.viewTreeObserver.addOnPreDrawListener(object : android.view.ViewTreeObserver.OnPreDrawListener {
			override fun onPreDraw(): Boolean {
				root.viewTreeObserver.removeOnPreDrawListener(this)
				drawn = true
				scheduleLoadEvents()
				return true
			}
		})
	}

	private fun stopLoadEvents() {
		root.viewTreeObserver.removeOnGlobalLayoutListener(onLayout)
		root.viewTreeObserver.removeOnScrollChangedListener(onScroll)
	}

	private fun scheduleLoadEvents() {
		if (!drawn || released) return
		if (!idleQueued && runtime.due(EventName.Idle).isNotEmpty()) {
			idleQueued = true
			android.os.Looper.myQueue().addIdleHandler {
				idleQueued = false
				if (!released) for (host in runtime.due(EventName.Idle)) apply(runtime.dispatch(host, EventName.Idle))
				false
			}
		}
		raiseVisible()
	}

	/** An element's box in CSS pixels from the top left of the page's part of the screen, as `getBoundingClientRect()` gives it; null before it is laid out. */
	private fun measureBox(id: String): ElementBox? {
		val view = views[id] ?: return null
		if (!view.isAttachedToWindow) return null
		val viewport = root.parent as? View ?: root
		val origin = IntArray(2).also(viewport::getLocationInWindow)
		val at = IntArray(2).also(view::getLocationInWindow)
		return ElementBox(
			(at[0] - origin[0] - viewport.paddingLeft) / dpr,
			(at[1] - origin[1] - viewport.paddingTop) / dpr,
			view.width / dpr,
			view.height / dpr,
			view.layoutDirection == View.LAYOUT_DIRECTION_RTL,
		)
	}

	/** Raises `visible` for each instance due one that has any of its box inside the page's part of the screen. */
	private fun raiseVisible() {
		if (!drawn || released || raisingVisible || root.windowVisibility != View.VISIBLE) return
		val viewport = root.parent as? View ?: return
		val screen = Rect()
		if (!viewport.getGlobalVisibleRect(screen)) return
		screen.set(screen.left + viewport.paddingLeft, screen.top + viewport.paddingTop, screen.right - viewport.paddingRight, screen.bottom - viewport.paddingBottom)
		raisingVisible = true
		try {
			for (host in runtime.due(EventName.Visible)) {
				val view = views[host] ?: continue
				if (!view.isShown) continue
				val at = IntArray(2).also(view::getLocationInWindow)
				// Edge-adjacent counts, as an IntersectionObserver with no threshold reports it.
				if (at[0] <= screen.right && at[0] + view.width >= screen.left && at[1] <= screen.bottom && at[1] + view.height >= screen.top)
					apply(runtime.dispatch(host, EventName.Visible))
			}
		} finally {
			raisingVisible = false
		}
	}

	/** Set when another page replaces this one: device answers that arrive later change nothing. */
	var released = false
		private set

	/** Another page replaces this one: its device objects end, and device answers that arrive later change nothing. */
	fun release() {
		released = true
		stopTimersAndRequests()
		for (o in payload.objects) device?.release(o.id)
	}

	private var left = false

	/** The screen is gone: its async values' runs abort, no timer fires and no pending request answers after this. */
	fun stopTimersAndRequests() {
		if (!left) {
			left = true
			for (entry in runtime.leave()) if (entry is JournalEntry.Abort) scriptServices.abort(entry.id)
		}
		timers.removeCallbacksAndMessages(null)
		pendingTimers.clear()
		scriptServices.stop()
	}

	/** Starts the engine and loads this page's script once the first frame is drawn and the main loop is idle. */
	fun warmScriptWhenIdle() {
		if (payload.script == null || !AppScriptEngine.available) return
		val drawn = object : android.view.ViewTreeObserver.OnDrawListener {
			var seen = false
			override fun onDraw() {
				if (seen) return
				seen = true
				// A draw listener cannot remove itself while the draw runs.
				root.post { root.viewTreeObserver.takeIf { it.isAlive }?.removeOnDrawListener(this) }
				android.os.Looper.myQueue().addIdleHandler {
					// Warming only saves time; a failure here shows again, and throws, at the first entry.
					if (!released) runCatching { AppScriptEngine.warm(runtime) }.onFailure { Log.e(AppScriptEngine.TAG, "engine warm failed", it) }
					false
				}
			}
		}
		root.viewTreeObserver.addOnDrawListener(drawn)
	}

	private fun needDevice(): NativeDevice = device ?: throw MarklessHostError("the payload names device features and this host was given no device")

	private fun runCall(call: JournalEntry.Call) {
		val cell = call.result
		val continuation = call.resume
		val settle: ((DeviceOutcome) -> Unit)? = when {
			cell != null -> { outcome ->
				if (!released) apply(when (outcome) {
					is DeviceOutcome.Value -> runtime.settle(cell, outcome.value)
					is DeviceOutcome.Error -> runtime.settleError(cell, outcome.name, outcome.message)
				})
			}
			// An awaited call from a handler: the rest of the handler runs with the answer; a failure goes to its `@catch`.
			continuation != null -> { outcome ->
				if (!released) apply(when (outcome) {
					is DeviceOutcome.Value -> runtime.resume(continuation, outcome.value)
					is DeviceOutcome.Error -> runtime.reject(continuation, outcome.name, outcome.message)
				})
			}
			else -> null
		}
		needDevice().call(call.node, call.obj, call.arguments, settle)
	}

	fun view(id: String): View = views[id] ?: (if (id in members) views[paragraphOf(id)] else null) ?: throw MarklessHostError("no view for \"$id\"")

	fun hasView(id: String): Boolean = id in views || id in members

	/** Every instance id that is shown: one with its own view, or a part of a paragraph's text view. */
	fun viewIds(): Set<String> = built.keys + members

	fun textView(id: String): TextView = textViews[id] ?: (if (id in members) textViews[paragraphOf(id)] else null) ?: throw MarklessHostError("no text view for \"$id\"")

	/** The string a text instance shows: its own text view's, or its part of its paragraph's. */
	fun shownText(id: String): String = heldTexts[id] ?: textView(id).text.toString()

	/** The instance id of the paragraph [id] is part of: its first node, in the same row. */
	private fun paragraphOf(id: String): String {
		val at = id.indexOf('@')
		val base = if (at < 0) id else id.substring(0, at)
		val lead = flow?.leadOf?.get(base) ?: return id
		return lead + if (at < 0) "" else id.substring(at)
	}

	/** Renders a paragraph again from the texts it holds. */
	private fun render(lead: String) {
		val f = flow ?: return
		val view = textViews[lead] ?: return
		val at = lead.indexOf('@')
		val base = if (at < 0) lead else lead.substring(0, at)
		val node = f.node(base)!!
		view.text = f.render(base, if (at < 0) "" else lead.substring(at), f.blockText(node.parent).preformatted) { heldTexts[it] }
	}

	/** Whether the sheet's dialog is on screen. */
	fun sheetShowing(id: String): Boolean = (sheets[id] ?: throw MarklessHostError("no sheet \"$id\"")).showing

	/** The platform closed the sheet (swipe, back, a tap on the dimmed page): runs its `dismiss` handler. */
	fun closedByPlatform(id: String) {
		if (runtime.handlerFor(id, EventName.Dismiss) != null) apply(runtime.dispatch(id, EventName.Dismiss))
	}

	/** Each element view and the instance it shows, for finding the element under a touch. */
	internal fun elementNodes(): Map<View, String> = java.util.IdentityHashMap<View, String>().apply {
		for ((id, inst) in built) if (inst.node is Node.Element) views[id]?.let { put(it, id) }
	}

	/** Reports a touch in window coordinates to the runtime as pointer events; call it before the views see the touch. True when a long press took the gesture. */
	fun touch(event: android.view.MotionEvent): Boolean = overlays.touch(event)

	private var lastPress: Triple<String, Long, Int>? = null

	/** A press's count (`event.detail`): a second press on the same view within the double-tap time is 2, as Chrome counts a double tap. */
	private fun pressCount(id: String): Int {
		val now = android.os.SystemClock.uptimeMillis()
		val count = lastPress?.let { (last, at, n) -> if (last == id && now - at < android.view.ViewConfiguration.getDoubleTapTimeout()) n + 1 else 1 } ?: 1
		lastPress = Triple(id, now, count)
		return count
	}

	/** Applies a key's or paste's journal and answers whether its handler called `preventDefault()`. */
	private fun prevents(journal: List<JournalEntry>): Boolean {
		apply(journal)
		return journal.any { it is JournalEntry.PreventDefault }
	}
	/** A scroll view took the touches that are down to scroll ([TakesTouches]): each is cancelled. */
	fun scrollTookTouches() = overlays.cancelTouches()

	/** The journal applier: the only code that changes a retained view after the first build. */
	fun apply(journal: List<JournalEntry>) {
		dismissMessage()
		var slotMoved = false
		var rowSlotMoved = false
		for (entry in journal) {
			when (entry) {
				is JournalEntry.Text -> if (flow != null) {
					if (entry.node !in heldTexts) throw MarklessHostError("journal names text \"${entry.node}\", which is not shown")
					heldTexts[entry.node] = entry.value
					render(paragraphOf(entry.node))
				} else textView(entry.node).let { it.text = entry.value; drawLines(it) }
				is JournalEntry.Attribute -> if (flow?.flowing(flow.node(entry.node.substringBefore('@'))) == true) {
					// A phrase element's attributes (`datetime`, `title`) change nothing its paragraph shows.
					attrs.getOrPut(entry.node) { HashMap() }.let { if (entry.value == null) it.remove(entry.name) else it[entry.name] = entry.value }
				} else attribute(entry.node, entry.name, entry.value)
				is JournalEntry.Property -> if (entry.node !in inert) {
					val field = view(entry.node) as? EditText ?: throw MarklessHostError("journal sets the value of \"${entry.node}\", which is not an input")
					if (field.text.toString() != entry.value) { field.setAppText(entry.value); field.setSelection(entry.value.length) }
				}
				is JournalEntry.State -> if (page != null) {
					if (!page.advance(entry.node, entry.value)) throw MarklessHostError("style export has no state for cell \"${entry.node}\"")
					for (s in sheetLayouts.values) for (l in s.layouts) l.advance(entry.node, entry.value)
					repaint()
				}
				is JournalEntry.Slot -> {
					val base = entry.slot.substringBefore('@')
					if (slotValues.put(entry.slot, entry.value) == null && base == entry.slot) throw MarklessHostError("journal sets slot \"${entry.slot}\", which the payload does not have")
					slotMoved = slotMoved || planned?.slots.orEmpty().any { it.id == base }
					rowSlotMoved = rowSlotMoved || base != entry.slot
				}
				// Each select's shown choice is read again once the whole journal is applied.
				is JournalEntry.Selected -> {}
				is JournalEntry.Check -> if (entry.node !in inert) (view(entry.node) as? CompoundButton ?: throw MarklessHostError("journal sets the checkedness of \"${entry.node}\", which is not a checkbox or radio button")).isChecked = entry.checked
				is JournalEntry.Dialog -> dialog(entry.node, entry.open)
				is JournalEntry.Command -> command(view(entry.node), entry.command, entry.preventScroll)
				is JournalEntry.Overlay -> overlays.show(entry.node, entry.open, entry.modal)
				is JournalEntry.Arm -> {
					val branch = entry.node.substringBefore('@')
					if (runtime.node(branch) !is Node.Branch) throw MarklessHostError("journal names \"${entry.node}\", which is not a branch")
					if ('@' !in entry.node) rebuild() else {
						val key = entry.node.substringAfter('@')
						rebuild { it.rowKey == key && inArm(it.node, branch) }
					}
					followArms()
				}
				is JournalEntry.Invalid -> invalid(entry.node, entry.message)
				is JournalEntry.Timer -> scheduleTimer(entry.node, entry.ms)
				// Read by the field that dispatched the key or paste, which leaves out what it would do.
				JournalEntry.PreventDefault -> {}
				is JournalEntry.Navigate -> {
					timers.removeCallbacksAndMessages(null)
					Log.i(TAG, "journal ${entry.toJson()}")
					onJournal?.invoke(journal)
					(onNavigate ?: throw MarklessHostError("navigate to ${entry.node} with no page builder")).invoke(entry)
					return
				}
				is JournalEntry.Title -> (onTitle ?: throw MarklessHostError("title \"${entry.value}\" with no title bar")).invoke(entry.value)
				is JournalEntry.Sheet -> (sheets[entry.node] ?: throw MarklessHostError("journal names \"${entry.node}\", which is not a sheet")).let { if (entry.open) it.open() else it.close() }
				is JournalEntry.Call -> runCall(entry)
				is JournalEntry.Release -> needDevice().release(entry.node)
				is JournalEntry.ClearTimer -> pendingTimers.remove(entry.node)?.let(timers::removeCallbacks)
				is JournalEntry.Fetch -> scriptServices.fetch(entry.id, entry.request) { if (!released) apply(runtime.response(entry.id, it)) }
				is JournalEntry.Abort -> scriptServices.abort(entry.id)
				is JournalEntry.Rows -> {
					// An inner list's copy in one outer row is `<list>@<outer key>`.
					if (runtime.node(entry.node.substringBefore('@')) !is Node.Repeat) throw MarklessHostError("journal names \"${entry.node}\", which is not a list")
					rebuild()
				}
			}
			Log.i(TAG, "journal ${entry.toJson()}")
		}
		if (slotMoved) laidOutFor?.let { layOutAt(it.first, it.second, rowsMoved = rowSlotMoved) }
		syncSheets()
		refreshRelations()
		refreshSelects()
		// A styled list's rows, a row's text or an attribute of a row's copy moved, or an arm that may hold a list opened: the page is laid out again with its rows.
		if (planned?.planRepeats?.isNotEmpty() == true && journal.any { it is JournalEntry.Rows || it is JournalEntry.Arm || ((it is JournalEntry.Text || it is JournalEntry.Attribute) && '@' in it.node) }) {
			laidOutFor?.let { (w, h) -> layOutAt(w, h, rowsMoved = true) }
		}
		onJournal?.invoke(journal)
		scheduleLoadEvents()
	}

	/** The colour behind the page in the current assignment (the export's canvas, else the web canvas's white); null unstyled. */
	val canvasColor: Int? get() = page?.let { it.export.assignments[it.assignment].canvas?.argb ?: Color.WHITE }

	/** body's own box and colour in the current assignment, in the page's pixels as [rootFrame]; null when body paints none. */
	val bodyBox: Pair<Rect, Int>? get() = page?.let { p ->
		val color = p.export.assignments[p.assignment].body ?: return@let null
		val origin = p.absolutes[p.assignment]["body"] ?: throw MarklessHostError("body paints a background, but the style export gives it no box")
		val frame = p.export.assignments[p.assignment].byId.getValue("body").frame!!
		Rect(origin.first.roundToInt(), origin.second.roundToInt(), (origin.first + frame.width).roundToInt(), (origin.second + frame.height).roundToInt()) to color.argb
	}

	/** Called with [canvasColor] whenever the assignment changes. */
	var onCanvas: ((Int) -> Unit)? = null

	/** The device's appearance changed: move to the @media band it selects, as a cell's `state` entry moves to its assignment. */
	fun configurationChanged(configuration: Configuration) {
		if (!followBand(isDark(configuration))) return
		repaint()
		Log.i(TAG, "band (${if (isDark(configuration)) "dark" else "light"}), style assignments ${allLayouts().map { it.assignment }}")
	}

	/** The page's current style assignment; null unstyled. */
	val assignment: Int? get() = page?.assignment

	/**
	 * With Dragon's plan, the page lays out at the size it is shown at, as a browser does: [widthPx] x [heightPx] is the page
	 * area. Chrome on Android lays a page out at a whole CSS px width, the screen's width in dp rounded up. Returns whether it
	 * laid out again.
	 */
	fun layOutAt(widthPx: Int, heightPx: Int, rowsMoved: Boolean = false): Boolean {
		val p = page ?: return false
		val layout = planLayout ?: return false
		if (planned?.plan == null || widthPx <= 0 || heightPx <= 0) return false
		val at = Triple(widthPx, heightPx, planned.slots.map { slotValues.getValue(it.id) })
		if (!rowsMoved && laidOutFor == at) return false
		val withRows = planned.planRepeats.isNotEmpty()
		val shaper = if (withRows) rowShaper ?: RowShaper(planned.systemFaces).also { rowShaper = it } else null
		val next = planned.laidOut(
			Math.ceil(widthPx / dpr - 1e-9), heightPx / dpr, dpr, layout, at.third,
			rows = if (withRows) planned.shownRows(payload, runtime) else null,
			rowsLayout = shaper?.let { RowShaper.rowsLayout(it) ?: throw MarklessHostError("a page with styled rows needs Dragon's rows layout in the app") },
		)
		style = next
		p.relaid(next)
		laidOutFor = at
		followBand(isDark(context.resources.configuration))
		repaint()
		Log.i(TAG, "laid out at ${next.viewportWidth}x${next.viewportHeight} dp, style assignment ${p.assignment}")
		return true
	}

	/**
	 * Every shown element's and text's box in device px from [origin]'s top left, by node id: what a layout check compares with
	 * a browser's boxes. A text node's box is its frame where its view draws its lines.
	 */
	fun shownFrames(origin: View): List<Pair<String, List<Double>>> {
		val from = IntArray(2).also { origin.getLocationInWindow(it) }
		return built.keys.sorted().mapNotNull { id ->
			val inst = built.getValue(id)
			val view = views[id] ?: return@mapNotNull null
			if (sheetOf[inst.node.id] != null) return@mapNotNull null
			var at: View? = view
			while (at != null) {
				if (at.visibility != View.VISIBLE) return@mapNotNull null
				if (at === root) break
				at = at.parent as? View
			}
			if (at == null) return@mapNotNull null
			val loc = IntArray(2).also { view.getLocationInWindow(it) }
			val x = (loc[0] - from[0]).toDouble(); val y = (loc[1] - from[1]).toDouble()
			val lines = (view as? TextView)?.let { lineSources[it] }?.takeIf { inst.node is Node.Text }
			when {
				lines != null -> lines.first.frame!!.let { f -> listOf(x + lines.second.first, y + lines.second.second, f.width, f.height) }
				inst.node is Node.Text && view is Button -> listOf(x + view.paddingLeft, y + view.paddingTop, (view.width - view.paddingLeft - view.paddingRight).toDouble(), (view.height - view.paddingTop - view.paddingBottom).toDouble())
				else -> listOf(x, y, view.width.toDouble(), view.height.toDouble())
			}?.let { id to it }
		}
	}

	/** Moves every document to the band its appearance and laid-out size select; true when any moved. */
	private fun followBand(dark: Boolean): Boolean {
		var changed = false
		for (l in allLayouts()) {
			if (l.export.bandState < 0) continue
			val band = JsValue.Num(l.export.band(dark).toDouble())
			if (l.export.assignments[l.assignment].values[BAND_KEY] == band) continue
			l.advance(BAND_KEY, band)
			changed = true
		}
		return changed
	}

	private fun syncSheets() {
		val now = runtime.sheets().toMap()
		for (id in shownSheets - now.keys) sheets.getValue(id).close()
		for ((id, open) in now) if (open && id !in shownSheets) root.post { if (!released && id in shownSheets) sheets.getValue(id).open() }
		shownSheets = now.keys
	}

	/** A sheet came to rest at [snapPoint]: its content takes that height's layout. */
	private fun rested(id: String, snapPoint: Double, widthPx: Int, heightPx: Int) {
		val s = sheetLayouts[id] ?: return
		val at = s.snapPoints.indexOf(snapPoint)
		if (at < 0) throw MarklessHostError("sheet \"$id\" rests at $snapPoint, not one of ${s.snapPoints}")
		val layout = s.layouts[at]
		val w = widthPx / dpr; val h = heightPx / dpr
		if (!s.warned && (Math.abs(w - layout.export.viewportWidth) > 1 || Math.abs(h - layout.export.viewportHeight) > 1)) {
			s.warned = true
			Log.w(TAG, "sheet \"$id\" at $snapPoint shows its content in ${w}x$h dp, but its styles were laid out for ${layout.export.viewportWidth}x${layout.export.viewportHeight} (a Pixel 7, API 36)")
		}
		if (at == s.current) return
		s.current = at
		repaint()
		Log.i(TAG, "sheet $id at $snapPoint, style assignment ${layout.assignment}")
	}

	/** Moves each styled branch's style state to the arm it shows now, inner ones included, and lays the page out again. */
	private fun followArms() {
		if (page == null) return
		var moved = false
		for (b in styledBranches) {
			val value = runtime.styleArm(b) ?: continue
			for (l in allLayouts()) {
				val before = l.assignment
				if (l.advance(b, value)) moved = moved || l.assignment != before
			}
		}
		if (moved) repaint()
	}

	private fun repaint() {
		canvasColor?.let { onCanvas?.invoke(it) }
		for (inst in built.values.sortedBy { order.getValue(it.node.id) }) place(inst, views.getValue(inst.id))
		root.requestLayout()
		// A sheet's boxes live in its dialog, outside the page's root.
		for (view in views.values) if (view is MarklessBox) view.requestLayout()
	}

	/** After an arm or rows entry: drop instances no longer shown, build the new ones from current values, then put each parent's children in order; [only] narrows a row arm's entry to that row's arm. */
	private fun rebuild(only: ((Instance) -> Boolean)? = null) {
		removeHidden(only)
		buildShown(only)
		for (v in views.values.toList() + scrollers.values.map { it.second }) if (v is MarklessBox) reorder(v)
		pageBox?.let { reorder(it) }
		refreshMarkers()
	}

	/** Each list's markers, numbered in the order its items show now. */
	private fun refreshMarkers() {
		if (flow == null) return
		for (inst in built.values) {
			val marker = (inst.node as? Node.Element)?.defaultStyle?.marker ?: continue
			val box = views[inst.id] as? MarklessBox ?: continue
			val items = (0 until box.childCount).map { box.getChildAt(it) }.filter { v -> built[views.entries.firstOrNull { it.value === v }?.key]?.node.let { it is Node.Element && it.element == "li" } }
			box.markers = items.withIndex().associate { (i, v) -> v to if (marker == "decimal") "${i + 1}." else "•" }
		}
	}

	private fun shownInstances(only: ((Instance) -> Boolean)? = null): List<Instance> =
		payload.nodes.filter { it is Node.Element || it is Node.Text }.flatMap(runtime::instances).let { all -> if (only == null) all else all.filter(only) }

	/** Whether [node] sits in an arm of [branch], directly or through nested branches. */
	private fun inArm(node: Node, branch: String): Boolean {
		val a = node.arm ?: return false
		return a.branch == branch || inArm(runtime.node(a.branch), branch)
	}

	private fun inScope(id: String, only: ((Instance) -> Boolean)?): Boolean =
		only == null || only(Instance(id, runtime.node(id.substringBefore('@')), Scope.EMPTY, id.substringAfter('@', "").ifEmpty { null }))

	private fun removeHidden(only: ((Instance) -> Boolean)? = null) {
		val live = shownInstances(only).mapTo(HashSet()) { it.id }
		members.removeAll { it !in live && inScope(it, only) }
		heldTexts.keys.removeAll { it !in live && inScope(it, only) }
		for (inst in built.values.sortedByDescending { order.getValue(it.node.id) }) {
			if (inst.id in live || (only != null && !only(inst))) continue
			if (shapeOwners.remove(inst.id) != null) {
				built.remove(inst.id)
				continue
			}
			val view = views.remove(inst.id)!!
			built.remove(inst.id)
			scrollers.remove(inst.id)
			textViews.remove(inst.id)
			inert.remove(inst.id)
			if (inst.node is Node.Text && view is TextView) {
				hideLines(view)
				lineSources.remove(view)
			}
			if ((inst.node is Node.Text || flow?.flowing(inst.node) == true) && view is Button) continue
			expanded.remove(view)
			(view.parent as? ViewGroup)?.let { p ->
				(p as? MarklessBox)?.frames?.remove(view)
				p.removeView(view)
			}
		}
	}

	private fun buildShown(only: ((Instance) -> Boolean)? = null) {
		val fresh = ArrayList<String>()
		for (inst in shownInstances(only)) {
			val node = inst.node
			if (flow != null) {
				if (node is Node.Text && inst.id !in heldTexts) heldTexts[inst.id] = runtime.text(node, inst.scope)
				val lead = flow.leadOf[node.id]
				if (lead != null && lead != node.id) { members.add(inst.id); continue }
			}
			if (inst.id in views || inst.id in shapeOwners) continue
			val shape = (node as? Node.Element)?.shape
			if (shape != null) {
				// A shape inside an svg is drawn by the svg's view; it has no view of its own.
				val drawn = parentOf(inst)?.let { views[it] } as? DrawingView ?: throw MarklessHostError("the shape \"${inst.id}\" is not inside a drawing")
				val outline = (node as Node.Element).bindings.firstOrNull { !it.property && it.name == "d" }?.let { runtime.attribute(it, inst.scope) }
				shapeOwners[inst.id] = drawn
				drawn.addShape(inst.id, shape, outline)
				built[inst.id] = inst
				continue
			}
			val view = when {
				flow != null && flow.leadOf[node.id] == node.id -> paragraph(inst).also { fresh.add(inst.id) }
				node is Node.Element -> element(node, inst)
				node is Node.Text -> text(node, inst)
				else -> continue
			}
			views[inst.id] = view
			(node as? Node.Element)?.let { liveRegion(it, view) }
			built[inst.id] = inst
			val parentId = parentOf(inst)
			val outer = if (parentId != null) views[parentId] else pageBox
			if (outer != null && view !== outer) {
				val box = (parentId?.let { scrollers[it]?.second } ?: outer) as? MarklessBox ?: throw MarklessHostError("\"${inst.id}\" is inside \"$parentId\", which cannot hold children on Android")
				box.addView(view)
				reorder(box)
			}
			if (style != null) place(inst, view)
		}
		for (id in fresh) render(id)
	}

	/** The one text view of the paragraph that starts at [inst]; a button whose text it is shows it as its own. */
	private fun paragraph(inst: Instance): TextView {
		val f = flow!!
		val parent = parentOf(inst)?.let { views.getValue(it) } ?: pageBox!!
		val block = f.blockText(inst.node.parent)
		val view: TextView = if (parent is Button) {
			if (textViews.values.any { it === parent }) throw MarklessHostError("button \"${inst.node.parent}\" has more than one paragraph; Android holds one per button")
			parent
		} else TextView(context).apply {
			includeFontPadding = false
			isClickable = false
			isFocusable = false
			named(this, inst.id, heading = parent.isAccessibilityHeading)
		}
		if (view !is Button || block != BlockText(false, false, false, 1.0, false)) {
			view.typeface = Typeface.create(if (block.monospace) Typeface.MONOSPACE else Typeface.DEFAULT, when {
				block.bold && block.italic -> Typeface.BOLD_ITALIC
				block.bold -> Typeface.BOLD
				block.italic -> Typeface.ITALIC
				else -> Typeface.NORMAL
			})
			view.setTextSize(TypedValue.COMPLEX_UNIT_PX, (baseTextSize * block.size).toFloat())
		}
		if (block.preformatted) {
			view.setHorizontallyScrolling(true)
			view.isHorizontalScrollBarEnabled = true
			view.movementMethod = android.text.method.ScrollingMovementMethod()
		}
		textViews[inst.id] = view
		return view
	}

	/** The instance id of [inst]'s parent: in the same row as [inst] at the parent's own depth when the parent is a row node. */
	private fun parentOf(inst: Instance): String? {
		val p = inst.node.parent ?: return null
		val row = runtime.node(p).row ?: return p
		return "$p@${inst.scope.keys[row] ?: throw MarklessHostError("\"${inst.id}\" is outside the rows of its parent \"$p\"")}"
	}

	/**
	 * Where an instance sits among its siblings: document order, with a list's rows at the list's place, in row order. A row
	 * of a list inside another list's row is ordered within that list's copy (`<list>@<outer key>`).
	 */
	private fun position(inst: Instance, rowIndex: Map<String, Map<String, Int>>): List<Int> {
		val r = inst.node.row ?: return listOf(order.getValue(inst.node.id))
		val outer = runtime.node(r).row?.let { inst.scope.keys.getValue(it) }
		val copy = if (outer == null) r else "$r@$outer"
		val key = inst.scope.keys.getValue(r).let { if (outer == null) it else it.removePrefix("$outer@") }
		return listOf(order.getValue(r), rowIndex.getValue(copy).getValue(key), order.getValue(inst.node.id))
	}

	/** Moves [box]'s retained children into position order; the views are kept, only their places change. */
	private fun reorder(box: MarklessBox) {
		val rowIndex = runtime.rows().associate { (id, keys) -> id to keys.withIndex().associate { it.value to it.index } }
		val ids = HashMap<View, Instance>().apply { for ((id, v) in views) if (v.parent === box) put(v, built.getValue(id)) }
		val current = (0 until box.childCount).map { box.getChildAt(it) }
		// A view no node owns (a select's shown choice) stays first.
		val wanted = current.sortedWith { a, b ->
			val pa = ids[a]?.let { position(it, rowIndex) } ?: emptyList(); val pb = ids[b]?.let { position(it, rowIndex) } ?: emptyList()
			(0 until minOf(pa.size, pb.size)).map { pa[it].compareTo(pb[it]) }.firstOrNull { it != 0 } ?: pa.size.compareTo(pb.size)
		}
		if (wanted == current) return
		box.removeAllViews()
		for (v in wanted) box.addView(v)
	}

	private fun named(view: View, id: String, heading: Boolean = false, control: Boolean = false, link: Boolean = false, image: Boolean = false) {
		view.isAccessibilityHeading = heading
		// A drawing is read only when it is named (an `aria-label`, or its <title>); an unnamed one is decoration.
		if (image) view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
		view.accessibilityDelegate = object : View.AccessibilityDelegate() {
			override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
				super.onInitializeAccessibilityNodeInfo(host, info)
				info.viewIdResourceName = id
				if (control) info.className = Button::class.java.name
				if (image) info.className = android.widget.ImageView::class.java.name
				val current = attrs[id].orEmpty()
				if (current["role"] == "switch") {
					info.className = "android.widget.Switch"
					info.isCheckable = true
					info.isChecked = current["aria-checked"] == "true"
				}
				current["aria-describedby"]?.let { info.hintText = textOf(it) }
				// As on the web, an aria-disabled control still takes presses; only assistive technology hears it as disabled.
				if (current["aria-disabled"] == "true") info.isEnabled = false
				if (link) info.extras.putCharSequence("AccessibilityNodeInfo.roleDescription", "link")
				val state = expanded[host] ?: return
				if (Build.VERSION.SDK_INT >= 36) info.expandedState = if (state) AccessibilityNodeInfo.EXPANDED_STATE_FULL else AccessibilityNodeInfo.EXPANDED_STATE_COLLAPSED
				info.addAction(if (state) AccessibilityNodeInfo.AccessibilityAction.ACTION_COLLAPSE else AccessibilityNodeInfo.AccessibilityAction.ACTION_EXPAND)
			}
		}
	}

	private fun element(node: Node.Element, inst: Instance): View {
		// A Button holds one text run; a button with an element inside (a switch's thumb) is a box that reads as a Button.
		val holdsElements = payload.nodes.any { it.parent == node.id && it is Node.Element && flow?.flowing(it) != true }
		val drawing = node.drawing
		val unstyled = flow?.let { node.defaultStyle }
		val type = node.attributes["type"].takeIf { node.element == "input" }
		// A family's visually hidden checkbox (aria-hidden) draws nothing; a plain one is a platform control.
		val unseen = type == "hidden" || (type in TICKABLE && node.attributes["aria-hidden"] == "true")
		if (unseen) inert.add(inst.id)
		val view = when (if (node.element == "button" && holdsElements) "box-button" else if (drawing != null) "drawing" else if (unstyled?.rule == true) "rule" else if (unseen) "unseen" else if (type in TICKABLE) type else node.element) {
			"drawing" -> DrawingView(context, drawing!!, baseTextSize * (flow?.blockText(node.parent)?.size ?: 1.0)).also {
				// An svg's text is read as its own, as the browser exposes it; an svg without text is read only when named.
				named(it, inst.id, image = drawing.label == null)
				drawing.label?.let { label -> it.contentDescription = label; it.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES }
			}
			"rule" -> RuleView(context).also { named(it, inst.id) }
			"unseen" -> View(context)
			// The runtime owns checkedness: the widget never toggles itself, a press dispatches and the journal sets it.
			"checkbox", "radio" -> (if (type == "radio") object : RadioButton(context) { override fun toggle() {} } else object : CheckBox(context) { override fun toggle() {} }).apply {
				if (style == null) { minWidth = (48 * dpr).roundToInt(); minHeight = (48 * dpr).roundToInt() }
				if (node.row == null) isChecked = runtime.checkedOf(node.id)
				named(this, inst.id)
			}
			"box-button" -> MarklessBox(context).apply {
				isClickable = true; isFocusable = true; named(this, inst.id, control = true)
				// The stacking layout gives a control the platform's 48 dp touch target, so one with no text yet can be pressed.
				if (style == null) { minimumWidth = (48 * dpr).roundToInt(); minimumHeight = (48 * dpr).roundToInt() }
			}
			"button" -> Button(context).apply {
				background = null
				minWidth = 0; minHeight = 0; minimumWidth = 0; minimumHeight = 0
				isAllCaps = false
				stateListAnimator = null
				includeFontPadding = false
				setPadding(0, 0, 0, 0)
				gravity = Gravity.TOP or Gravity.START
				named(this, inst.id)
			}
			"camera" -> {
				val obj = node.obj ?: throw MarklessHostError("<camera> \"${node.id}\" shows no device object")
				val device = payload.objects.firstOrNull { it.id == obj }?.device ?: throw MarklessHostError("<camera> \"${node.id}\" names unknown object \"$obj\"")
				needDevice().view(obj, device).also { named(it, inst.id) }
			}
			"img" -> SizedImage(context).also { named(it, inst.id) }
			"iframe" -> EmbeddedPage(
				context,
				node.attributes["src"] ?: throw MarklessHostError("<iframe> ${inst.id} has no src"),
				node.attributes["width"]?.toIntOrNull() ?: 300,
				node.attributes["height"]?.toIntOrNull() ?: 150,
			).also { it.contentDescription = node.attributes["title"]; it.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES }
			"audio" -> AudioButton(context).apply {
				visibility = View.GONE
				named(this, inst.id)
			}
			"select" -> SelectBox(context).apply {
				if (style == null) { minimumWidth = (120 * dpr).roundToInt(); minimumHeight = (48 * dpr).roundToInt() }
				named(this, inst.id, control = true)
				setOnClickListener {
					if (attrs[inst.id]?.containsKey("disabled") == true) return@setOnClickListener
					val choices = runtime.choices(node.id)
					choose(choices.map { it.label }, choices.map { it.disabled }, choices.indexOfFirst { it.selected }) { picked ->
						apply(runtime.dispatch(choices[picked].option, EventName.Choose))
					}
				}
			}
			// The select's list shows its options; their views only keep their text current.
			"option" -> MarklessBox(context).apply { visibility = View.GONE }
			"input", "textarea" -> if (node.attributes["type"] == "range") RangeBar(context).also { named(it, inst.id) } else MarklessField(context).apply {
				filters = arrayOf(LengthLimit { nativeMaxLength(attrs[inst.id]?.get("maxlength")) })
				val focusEvents = events[node.id].orEmpty().map { it.event }
				setOnFocusChangeListener { v, focused ->
					if (focused) bringIntoView(v, dev.markless.mobile.core.FOCUS_INTO_VIEW)
					val event = if (focused) EventName.Focus else EventName.Blur
					if (event in focusEvents) apply(runtime.dispatch(inst.id, event))
				}
				if (node.element == "input") {
					// Chrome gives an email field the email keyboard.
					if (node.attributes["type"] == "email") inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
					isSingleLine = true
					// After isSingleLine, whose transformation would show a password's text.
					if (type == "password") inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
					// Chrome's keyboard for a number field: digits, a decimal mark and a sign.
					if (type == "number") inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL or InputType.TYPE_NUMBER_FLAG_SIGNED
				} else {
					// A textarea's Return is a new line, and Chrome's default `rows="2"` shows two lines.
					inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
					isSingleLine = false
					minLines = 2
					gravity = Gravity.TOP or Gravity.START
				}
				includeFontPadding = false
				if (style != null) { background = null; setPadding(0, 0, 0, 0) }
				addTextChangedListener(object : TextWatcher {
					override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
					override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
					override fun afterTextChanged(s: Editable) = dismissMessage()
				})
				if (node.element == "input" && events[node.id].orEmpty().any { it.event == EventName.Enter || it.event == EventName.Keydown || it.event == EventName.Keyup }) imeOptions = EditorInfo.IME_ACTION_GO
				named(this, inst.id)
			}
			else -> MarklessBox(context).apply {
				named(this, inst.id, heading = node.element in HEADINGS, control = events[node.id].orEmpty().any { it.event == EventName.Activate }, link = node.element == "a")
				unstyled?.let { s ->
					table = s.table?.takeIf { it != "cell" }
					if (s.indent > 0) setPaddingRelative((s.indent * dpr).roundToInt(), 0, 0, 0)
				}
			}
		}
		layoutOf(inst.node)?.let { l -> l.export.assignments[l.assignment].byId[inst.id] }?.let { styled -> scrollContainer(inst.id, view, styled) }
		views[inst.id] = view
		if (!unseen && type !in TICKABLE) for (b in node.bindings) if (b.property && b.name == "value") (view as? EditText ?: throw MarklessHostError("\"${node.id}\" binds ${b.name} but is not an input")).setAppText(runtime.property(b, inst.scope))
		// A field's `value` attribute is its text until something sets it, as on the web.
		if (view is EditText && node.bindings.none { it.property && it.name == "value" }) (node.bindings.firstOrNull { !it.property && it.name == "value" }?.let { runtime.attribute(it, inst.scope) } ?: node.attributes["value"])?.let { view.setAppText(it) }
		for (e in events[node.id].orEmpty()) when (e.event) {
			EventName.Activate -> view.setOnClickListener { apply(runtime.dispatch(inst.id, EventName.Activate, detail = pressCount(inst.id))) }
			EventName.Dismiss -> if (OVERLAY_ATTRIBUTE !in node.attributes) throw MarklessHostError("dismiss event on \"${node.id}\", which is neither a sheet nor an overlay")
			// Raised by the field's focus listener, set where the field is built.
			EventName.Focus, EventName.Blur -> if (view !is EditText) throw MarklessHostError("${e.event.wire} event on \"${node.id}\", which is not a text field")
			// Off a text field a keydown comes only from a script, which the runtime raises.
			EventName.Keydown -> (view as? MarklessField)?.onKey = { key -> prevents(runtime.dispatch(inst.id, EventName.Keydown, key)) }
			EventName.Keyup -> (view as? MarklessField ?: throw MarklessHostError("keyup event on \"${node.id}\", which is not a text field")).onKeyUp = { key -> apply(runtime.dispatch(inst.id, EventName.Keyup, key)) }
			EventName.Paste -> (view as? MarklessField ?: throw MarklessHostError("paste event on \"${node.id}\", which is not a text field")).onPaste = { text -> prevents(runtime.dispatch(inst.id, EventName.Paste, text)) }
			EventName.Cancel, EventName.Close, EventName.Submit, EventName.Idle, EventName.Visible, EventName.PointerDown, EventName.PointerMove, EventName.PointerUp, EventName.PointerCancel,
			EventName.PointerOver, EventName.PointerOut, EventName.PointerEnter, EventName.PointerLeave, EventName.MouseOver, EventName.MouseOut,
			EventName.MouseEnter, EventName.MouseLeave, EventName.MouseMove, EventName.MouseDown, EventName.MouseUp, EventName.Choose, EventName.ContextMenu -> {}
			// The keyboard's action key arrives as its action id; a hardware Enter as IME_NULL with the key down, then up.
			EventName.Enter -> (view as? EditText ?: throw MarklessHostError("enter event on \"${node.id}\", which is not an input")).setOnEditorActionListener { _, actionId, key ->
				val now = android.os.SystemClock.uptimeMillis()
				when {
					key != null && key.keyCode != KeyEvent.KEYCODE_ENTER -> false
					key != null -> {
						if (key.action == KeyEvent.ACTION_DOWN) { enterPressedAt = now; apply(runtime.dispatch(inst.id, EventName.Enter)) }
						true
					}
					// One press can arrive as the Enter key and then again as the keyboard's action, or as IME_NULL with no key
					// from some keyboards: it submits once, and focus stays in the field (Android's default would move it on).
					now - enterPressedAt < 500 -> true
					else -> { enterPressedAt = now; apply(runtime.dispatch(inst.id, EventName.Enter)); true }
				}
			}
			EventName.Commit -> (view as? RangeBar ?: throw MarklessHostError("commit event on \"${node.id}\", which is not a range")).onCommit = { value -> apply(runtime.dispatch(inst.id, EventName.Commit, value)) }
			// A select's input handler runs when a choice lands, from the runtime's choose.
			EventName.Input -> if (node.element == "select") Unit else if (view is RangeBar) view.onInput = { value -> apply(runtime.dispatch(inst.id, EventName.Input, value)) } else (view as? EditText ?: throw MarklessHostError("input event on \"${node.id}\", which is not an input")).addTextChangedListener(object : TextWatcher {
				override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
				override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
				override fun afterTextChanged(s: Editable) {
					val text = s.toString()
					// A property entry the applier just wrote reads back as the runtime's own value: not an edit.
					if (node.bindings.firstOrNull { it.property && it.name == "value" }?.let { runtime.property(it, inst.scope) } == text) return
					apply(runtime.dispatch(inst.id, EventName.Input, text))
				}
			})
		}
		// A dialog shows nothing until showModal() puts it in the top layer (the UA's dialog:not([open]) { display: none }).
		if (node.element == "dialog") view.visibility = View.GONE
		for ((name, value) in node.attributes) if (name != "class") attribute(inst.id, name, value)
		if (drawing != null && node.bindings.any { !it.property && it.name == "viewBox" }) followingViewBox.add(inst.id)
		for (b in node.bindings) if (!b.property) attribute(inst.id, b.name, runtime.attribute(b, inst.scope))
		if (unseen) {
			view.visibility = View.GONE
			view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
		}
		return view
	}

	/**
	 * A scroll container gets the platform's scroll views over its padding box: a ScrollView for the block axis, a
	 * HorizontalScrollView for the inline axis, nested when both have a range. A drag that starts toward an end the box is
	 * already at goes to the page, as the web chains it.
	 */
	private fun scrollContainer(id: String, view: View, styled: StyledNode) {
		val w = styled.writes.filterIsInstance<StyleWrite.ScrollContainer>().singleOrNull() ?: return
		val box = view as? MarklessBox ?: throw MarklessHostError("\"$id\" is a scroll container but not a box")
		val range = styled.scrollRange ?: throw MarklessHostError("\"$id\" is a scroll container with no scroll range")
		if (range.minX != 0.0 || range.minY != 0.0) throw MarklessHostError("\"$id\" has a scroll range starting before 0 (right to left, or a reversed flex box), which is not implemented on Android")
		val x = w.x && range.maxX > 0
		val y = w.y && range.maxY > 0
		val indicators = StyleWrite.ScrollIndicatorsHidden !in styled.writes
		val vertical = BoxScrollView(context).apply { isVerticalScrollBarEnabled = indicators; isFillViewport = true; onTake = ::scrollTookTouches }
		val horizontal = BoxHorizontalScrollView(context).apply { isHorizontalScrollBarEnabled = indicators; isFillViewport = true; onTake = ::scrollTookTouches }
		val chain: List<FrameLayout> = when {
			x && y -> listOf(vertical, horizontal)
			x -> listOf(horizontal)
			else -> listOf(vertical)
		}
		val content = MarklessBox(context)
		for ((outer, inner) in chain.zipWithNext()) outer.addView(inner, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		chain.last().addView(content)
		box.addView(chain.first())
		scrollers[id] = chain to content
	}

	/** Puts a scroll container's scroll views over its padding box and sizes its content to the range. */
	private fun sizeScroller(id: String, box: MarklessBox, s: StyledNode, frame: Rect) {
		val (chain, content) = scrollers[id] ?: if (s.writes.any { it is StyleWrite.ScrollContainer }) throw MarklessHostError("\"$id\" became a scroll container after it was built") else return
		val w = s.writes.filterIsInstance<StyleWrite.ScrollContainer>().singleOrNull() ?: throw MarklessHostError("\"$id\" stopped being a scroll container after it was built")
		val range = s.scrollRange ?: throw MarklessHostError("\"$id\" is a scroll container with no scroll range")
		val bw = s.borderWidths ?: throw MarklessHostError("\"$id\" is a scroll container with no border widths")
		val port = Rect(bw.left.roundToInt(), bw.top.roundToInt(), frame.width() - bw.right.roundToInt(), frame.height() - bw.bottom.roundToInt())
		box.frames[chain.first()] = port
		content.fixedSize = (port.width() + if (w.x) range.maxX.roundToInt() else 0) to (port.height() + if (w.y) range.maxY.roundToInt() else 0)
	}

	/**
	 * Scrolls every scrolling ancestor of [target], innermost first, as Chrome's scrollIntoView() ([dev.markless.mobile.core.SCROLL_INTO_VIEW])
	 * or focus() ([dev.markless.mobile.core.FOCUS_INTO_VIEW]) does.
	 */
	fun bringIntoView(target: View, align: ScrollAlignment) {
		val chain = generateSequence(target.parent as? View) { it.parent as? View }.filterIsInstance<FrameLayout>().filter { it is ScrollView || it is HorizontalScrollView }.toList()
		if (chain.isEmpty()) return
		fun at(v: View) = IntArray(2).also { v.getLocationInWindow(it) }
		val boxes = chain.mapIndexed { i, s ->
			val child = s.getChildAt(0)
			val portW = (s.width - s.paddingLeft - s.paddingRight).toDouble()
			val portH = (s.height - s.paddingTop - s.paddingBottom).toDouble()
			val here = at(s)
			val origin = if (i + 1 < chain.size) at(chain[i + 1].getChildAt(0)).let { o -> (here[0] + s.paddingLeft - o[0]).toDouble() to (here[1] + s.paddingTop - o[1]).toDouble() } else 0.0 to 0.0
			ScrollBox(ScrollRect(origin.first, origin.second, portW, portH), s.scrollX.toDouble(), s.scrollY.toDouble(), ScrollRange(0.0, maxOf(0.0, child.width - portW), 0.0, maxOf(0.0, child.height - portH)))
		}
		val t = at(target)
		val inner = at(chain.first().getChildAt(0))
		val offsets = scrollIntoView(boxes, ScrollRect((t[0] - inner[0]).toDouble(), (t[1] - inner[1]).toDouble(), target.width.toDouble(), target.height.toDouble()), align)
		for ((s, o) in chain.zip(offsets)) s.scrollTo(o.first.roundToInt(), o.second.roundToInt())
	}

	/**
	 * The page's scrollable size in px, Dragon's page range over its viewport; null without a style export. A page taller than
	 * its viewport whose range Dragon leaves undecided is refused, naming Dragon's reason.
	 */
	fun pageSize(): Pair<Int, Int>? {
		val st = style ?: return null
		val w = (st.viewportWidth * dpr).roundToInt()
		val h = (st.viewportHeight * dpr).roundToInt()
		val range = st.assignments[page!!.assignment].pageScroll
		if (range != null) {
			if (range.minX != 0.0 || range.minY != 0.0 || range.maxX != 0.0) throw MarklessHostError("a page scroll range of $range (wider than the screen, or starting before 0) is not implemented on Android")
			return w to h + range.maxY.roundToInt()
		}
		val f = rootFrame
		if (f != null && (f.bottom > h + 1 || f.right > w + 1)) throw MarklessHostError("the page is ${f.bottom} px tall on a $h px screen, and Dragon does not decide its scroll range: ${st.pageScrollUndecided ?: "the style export has no page range"}")
		return w to h
	}

	/** The text field that has the keyboard, if any. */
	fun focusedField(): EditText? = views.values.firstOrNull { it is EditText && it.isFocused } as EditText?

	private fun text(node: Node.Text, inst: Instance): View {
		val parent = views.getValue(parentOf(inst) ?: throw MarklessHostError("text \"${inst.id}\" at the top of a styled page"))
		val view: TextView = if (parent is Button) {
			if (textViews.values.any { it === parent }) throw MarklessHostError("button \"${node.parent}\" has more than one text run; Android holds one per button")
			parent
		} else TextView(context).apply {
			includeFontPadding = false
			isClickable = false
			isFocusable = false
			named(this, inst.id, heading = parent.isAccessibilityHeading)
		}
		view.text = runtime.text(node, inst.scope)
		textViews[inst.id] = view
		return view
	}

	/** How TalkBack speaks a change inside the element: as built, or, when its live attributes follow state, as they read now. */
	private fun liveRegion(node: Node.Element, view: View) {
		val follows = node.liveFollows
		val assertive = if (follows != null) when ((runtime.evaluate(follows.politeness) as? JsValue.Str)?.value) {
			"assertive" -> true
			"polite" -> false
			else -> null
		} else node.live?.assertive
		view.accessibilityLiveRegion = when (assertive) {
			true -> View.ACCESSIBILITY_LIVE_REGION_ASSERTIVE
			false -> View.ACCESSIBILITY_LIVE_REGION_POLITE
			null -> View.ACCESSIBILITY_LIVE_REGION_NONE
		}
	}

	/** Attributes per the contract's Android mapping; `class` reaches views only through Dragon's style states, and any other attribute is ignored. */
	private fun attribute(id: String, name: String, value: String?) {
		shapeOwners[id]?.let { drawn ->
			if (name == "d") drawn.setOutline(id, value)
			return
		}
		val view = view(id)
		if (name == "viewBox" && id in followingViewBox) {
			(view as DrawingView).setViewBox(value)
			return
		}
		val current = attrs.getOrPut(id) { HashMap() }
		if (value == null) current.remove(name) else current[name] = value
		if (id in inert && (name == "aria-hidden" || name == "hidden")) return
		if (view is RangeBar && name in RangeBar.SHAPE) view.show(current)
		if (name == "role" || name == "aria-live") (payload.nodes.firstOrNull { it.id == id.substringBefore('@') } as? Node.Element)?.takeIf { it.liveFollows != null }?.let { liveRegion(it, view) }
		when (name) {
			// A press on a label acts on its control, as the web does: a text field takes the keyboard, any other is pressed.
			"for" -> if (value != null) view.setOnClickListener {
				when (val control = views[value]) {
					is EditText -> command(control, "focus", false)
					// A select is only focused, as a browser does; its picker opens from a press on the select itself.
					is SelectBox -> Unit
					else -> control?.performClick()
				}
			}
			"aria-label" -> if (view is AudioButton) view.label(value) else {
				view.contentDescription = value ?: (view as? DrawingView)?.label
				if (view is DrawingView && current["aria-hidden"] != "true") view.importantForAccessibility = if (view.contentDescription != null) View.IMPORTANT_FOR_ACCESSIBILITY_YES else View.IMPORTANT_FOR_ACCESSIBILITY_NO
			}
			"alt" -> if (view is SizedImage) view.contentDescription = value
			"src" -> when (view) {
				is SizedImage -> view.show(value)
				is AudioButton -> view.source(value)
			}
			"controls" -> if (view is AudioButton) view.visibility = if (value == null) View.GONE else View.VISIBLE
			"disabled" -> view.isEnabled = value == null
			"readonly" -> if (view is MarklessField) view.readOnly = value != null
			"aria-pressed", "aria-selected" -> view.isSelected = value == "true"
			"aria-expanded" -> expanded[view] = when (value) { "true" -> true; "false" -> false; else -> null }
			"aria-hidden" -> view.importantForAccessibility = if (value == "true") View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS else if (view is DrawingView) (if (view.contentDescription != null) View.IMPORTANT_FOR_ACCESSIBILITY_YES else View.IMPORTANT_FOR_ACCESSIBILITY_NO) else View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
			// With a style export Dragon decides visibility (a hidden element has no frame); the stacking layout reads `hidden`.
			"hidden" -> if (style == null) view.visibility = if (value != null) View.GONE else View.VISIBLE
		}
	}

	/** `focus()`: a text field takes the keyboard, anything else TalkBack's cursor; `scrollIntoView()`: its scrolling ancestors bring it on screen. */
	private fun command(view: View, command: String, preventScroll: Boolean) {
		// As on the web: scrollIntoView aligns the element to the start; focus brings it into view unless told not to.
		if (command == "scrollIntoView") return bringIntoView(view, dev.markless.mobile.core.SCROLL_INTO_VIEW)
		// `select()` selects a field's whole text; it does not move focus, as on the web.
		if (command == "select") return (view as? EditText ?: throw MarklessHostError("select() on a view that is not a text field")).selectAll()
		if (!preventScroll) bringIntoView(view, dev.markless.mobile.core.FOCUS_INTO_VIEW)
		if (view is EditText) {
			view.requestFocus()
			(context.getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager).showSoftInput(view, 0)
		} else view.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
	}

	/** A stopped submit: focus moves to the field as `focus()` would, and the message shows at the top of the page until the next action. */
	private fun invalid(id: String, text: String) {
		if (id !in inert) command(view(id), "focus", false)
		val activity = context as? Activity ?: throw MarklessHostError("an invalid field's message needs an Activity to show over")
		val content = activity.findViewById<ViewGroup>(android.R.id.content)
		val pad = (12 * dpr).roundToInt()
		val label = TextView(context).apply {
			this.text = text
			setTextColor(0xFFFFFFFF.toInt())
			setBackgroundColor(0xE6202124.toInt())
			setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
			setPadding(pad, pad, pad, pad)
		}
		val layer = FrameLayout(context).apply {
			setOnApplyWindowInsetsListener { v, insets ->
				v.setPadding(0, insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()).top, 0, 0)
				insets
			}
			// Watches for a press anywhere without taking it, so the press still reaches the page beneath.
			setOnTouchListener { _, event -> if (event.actionMasked == MotionEvent.ACTION_DOWN) post { dismissMessage() }; false }
			addView(label, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))
		}
		content.addView(layer, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		layer.requestApplyInsets()
		message = layer
		label.announceForAccessibility(text)
	}

	/** Takes down an `invalid` message, if one shows. */
	fun dismissMessage() {
		val layer = message ?: return
		message = null
		(layer.parent as? ViewGroup)?.removeView(layer)
	}

	/** The open dialog's top layer, its view's place in the page to return it to, and the back callback that cancels it. */
	private var topLayer: Triple<FrameLayout, Pair<ViewGroup, Int>, OnBackInvokedCallback>? = null

	/**
	 * The top layer: a full-screen layer above the page and the bars, holding the dialog's own view (styled by its CSS,
	 * not a system sheet). The page behind is hidden from TalkBack, and the back gesture closes the dialog as a cancel.
	 */
	private fun dialog(id: String, open: Boolean) {
		val view = view(id)
		val activity = context as? Activity ?: throw MarklessHostError("a dialog needs an Activity for its top layer")
		val content = activity.findViewById<ViewGroup>(android.R.id.content)
		if (open) {
			if (topLayer != null) throw MarklessHostError("a second dialog over \"$id\" has no top layer yet")
			val parent = view.parent as ViewGroup
			val index = parent.indexOfChild(view)
			parent.removeView(view)
			val layer = FrameLayout(context).apply {
				// Chrome's ::backdrop default, rgba(0, 0, 0, 0.1); a press on it is the page's, so it is consumed here.
				setBackgroundColor(0x1A000000)
				isClickable = true
				setOnApplyWindowInsetsListener { v, insets ->
					val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
					v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
					insets
				}
			}
			view.visibility = View.VISIBLE
			view.setBackgroundColor(0xFFFFFFFF.toInt())
			val pad = (16 * dpr).roundToInt()
			view.setPadding(pad, pad, pad, pad)
			// Centred, as the web centres a modal dialog (dialog:modal { inset: 0; margin: auto }) on every platform.
			layer.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
			content.addView(layer, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
			for (i in 0 until content.childCount) content.getChildAt(i).takeIf { it !== layer }?.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
			val back = OnBackInvokedCallback { apply(runtime.dispatch(id, EventName.Cancel)) }
			activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, back)
			topLayer = Triple(layer, parent to index, back)
			layer.requestApplyInsets()
		} else {
			val (layer, place, back) = topLayer ?: return
			activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(back)
			layer.removeView(view)
			content.removeView(layer)
			for (i in 0 until content.childCount) content.getChildAt(i).importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
			view.visibility = View.GONE
			place.first.addView(view, minOf(place.second, place.first.childCount))
			topLayer = null
		}
	}

	/** The text the elements named by a space-separated id list show, in view order. */
	private fun textOf(ids: String): String = ids.split(' ').mapNotNull { views[it] }.joinToString(" ") { textWithin(it) }

	private fun textWithin(view: View, skipped: View? = null): String = when {
		view === skipped -> ""
		view is TextView -> view.text.toString()
		view is ViewGroup -> (0 until view.childCount).map { textWithin(view.getChildAt(it), skipped) }.filter { it.isNotEmpty() }.joinToString(" ")
		else -> ""
	}

	/** Each select shows its chosen option's label, as the web's closed `<select>` does. */
	private fun refreshSelects() {
		for ((id, view) in views) if (view is SelectBox) view.show(runtime.choices(id).firstOrNull { it.selected }?.label ?: "")
	}

	/** `aria-labelledby` as the content description, kept current after every journal; a `<label>` names its control with its
	 * text, so TalkBack reads it there and not a second time on the label. */
	private fun refreshRelations() {
		for ((id, current) in attrs) {
			val view = views[id] ?: continue
			if (current["aria-label"] == null) current["aria-labelledby"]?.let { view.contentDescription = textOf(it) }
			val target = current["for"] ?: continue
			val control = views[target] ?: continue
			val own = attrs[target].orEmpty()
			val unnamed = own["aria-label"] == null && own["aria-labelledby"] == null
			if (unnamed) control.contentDescription = textWithin(view, control)
			val inside = generateSequence(control.parent) { it.parent }.any { it === view }
			if (!inside) view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
			else if (unnamed && view is ViewGroup)
				for (child in (0 until view.childCount).map { view.getChildAt(it) })
					if (child !== control && !(child is ViewGroup && generateSequence(control.parent) { it.parent }.any { it === child }))
						child.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
		}
	}

	private fun place(inst: Instance, view: View) {
		val node = inst.node
		val layout = layoutOf(node) ?: return
		val styled = layout.export.assignments[layout.assignment]
		val s = styled.byId[inst.id] ?: if (node.row != null && layout.export.planRepeats.isNotEmpty()) {
			// A row not laid out yet (at mount, or just added): the page is laid out again with its rows, which places it.
			view.visibility = View.GONE
			return
		} else throw MarklessHostError("style export has no node \"${inst.id}\"")
		if (s.kind != (if (node is Node.Text) "text" else "element")) throw MarklessHostError("style node \"${inst.id}\" is a ${s.kind}")
		val absolute = layout.absolutes[layout.assignment]
		val frame = s.frame
		val origin = absolute[s.id]
		if (inst.id in inert) {
			view.visibility = View.GONE
			return
		}
		// Dragon gives an element it does not render (`display: none`, `[hidden]`), and everything inside it, no frame.
		if (frame == null || origin == null) {
			view.visibility = View.GONE
			return
		}
		view.visibility = View.VISIBLE
		val sheet = sheetOf[node.id]
		if (sheet != null) (views.getValue(sheet) as MarklessBox).fixedSize = Math.round(layout.export.viewportWidth * dpr).toInt() to Math.round(maxOf(layout.export.viewportHeight * dpr, layout.contentBottom())).toInt()
		val (ax, ay) = origin
		val parentId = parentOf(inst)
		// The node's frame origin inside its view: a label's inside its button, other text's inside its outward-rounded view.
		var inView = (ax - Math.floor(ax)) to (ay - Math.floor(ay))
		if (node is Node.Text && view is Button) {
			val (bx, by) = absolute.getValue(parentId!!)
			val box = styled.byId.getValue(parentId).frame!!
			inView = (ax - bx.roundToInt()) to (ay - by.roundToInt())
			// The label rounds outward inside the button's rounded box, as other text does: a narrower content box wraps the run.
			view.setPadding(
				maxOf(0, Math.floor(ax).toInt() - bx.roundToInt()), maxOf(0, Math.floor(ay).toInt() - by.roundToInt()),
				maxOf(0, (bx + box.width).roundToInt() - Math.ceil(ax + frame.width).toInt()), maxOf(0, (by + box.height).roundToInt() - Math.ceil(ay + frame.height).toInt()),
			)
		} else {
			// A sheet's top-level content sits in the sheet's content box, which is its document's origin.
			var (ox, oy) = parentId?.takeIf { it != sheet }?.let { absolute.getValue(it) }?.let { it.first.roundToInt() to it.second.roundToInt() } ?: (0 to 0)
			// Inside a scroll container, frames count from its padding box, where its content box starts.
			parentId?.let { scrollers[it] }?.let { styled.byId.getValue(parentId).borderWidths?.let { bw -> ox += bw.left.roundToInt(); oy += bw.top.roundToInt() } }
			// Text rounds outward: a run a fraction of a pixel narrower than its frame wraps.
			val rect = if (node is Node.Text) {
				Rect(Math.floor(ax).toInt() - ox, Math.floor(ay).toInt() - oy, Math.ceil(ax + frame.width).toInt() - ox, Math.ceil(ay + frame.height).toInt() - oy)
			} else {
				Rect(ax.roundToInt() - ox, ay.roundToInt() - oy, (ax + frame.width).roundToInt() - ox, (ay + frame.height).roundToInt() - oy)
			}
			if (parentId == null) rootFrame = rect else (scrollers[parentId]?.second ?: views.getValue(parentId) as MarklessBox).frames[view] = rect
			if (view is MarklessBox) sizeScroller(inst.id, view, s, rect)
		}
		paint(view, s, styled)
		if (view is TextView && node is Node.Text) {
			lineSources[view] = s to inView
			drawLines(view)
		}
		// A box that paints nothing (an empty clip) has no order to keep.
		val paintsNothing = (view as? MarklessBox)?.clip?.isEmpty == true
		(view.parent as? MarklessBox)?.order(view, s.writes.filterIsInstance<StyleWrite.PaintOrder>().firstOrNull()?.takeIf { !paintsNothing }?.let { checkSiblingOrderSuffices(s, it, styled); it.bucket * 100_000 + it.rank + 1 } ?: 0)
	}

	/** Draws Dragon's lines over a text view whose text is still the one Dragon laid out; otherwise the view draws its own text. */
	private fun drawLines(view: TextView) {
		val (s, inView) = lineSources[view] ?: return
		val drawn = glyphLines[view]
		val lines = s.lines?.takeIf { s.text == view.text.toString() } ?: return hideLines(view)
		val color = s.writes.filterIsInstance<StyleWrite.TextColor>().lastOrNull()?.color?.argb ?: drawn?.color ?: view.currentTextColor
		val glyphs = drawn ?: GlyphLines(fonts).also { glyphLines[view] = it; view.overlay.add(it) }
		val frame = s.frame!!
		// One device px of slack on every side, so a glyph whose ink passes its advance is not cut at the frame's edge.
		glyphs.setBounds(-1, -1, Math.ceil(inView.first + frame.width).toInt() + 1, Math.ceil(inView.second + frame.height).toInt() + 1)
		glyphs.set(lines, inView.first, inView.second, color)
		view.setTextColor(Color.TRANSPARENT)
	}

	private fun hideLines(view: TextView) {
		val drawn = glyphLines.remove(view) ?: return
		view.overlay.remove(drawn)
		view.setTextColor(drawn.color)
	}

	/** After layout: the largest gap, in device px, between any edge of a view's laid-out box (relative to the root) and its Dragon frame. */
	fun frameDeviation(): Double {
		val page = page ?: throw MarklessHostError("no style export to compare frames with")
		val absolute = page.absolutes[page.assignment]
		val styled = page.export.assignments[page.assignment]
		val origin = absolute.getValue(payload.nodes.first().id)
		val rootAt = IntArray(2).also { root.getLocationInWindow(it) }
		var worst = 0.0
		for (inst in built.values.sortedBy { order.getValue(it.node.id) }) {
			val node = inst.node
			if (sheetOf[node.id] != null) continue
			val view = views.getValue(inst.id)
			if (view.visibility == View.GONE) continue
			val frame = styled.byId.getValue(inst.id).frame!!
			val a = absolute.getValue(inst.id)
			val at = IntArray(2).also { view.getLocationInWindow(it) }
			var x = (at[0] - rootAt[0]).toDouble(); var y = (at[1] - rootAt[1]).toDouble()
			var w = view.width.toDouble(); var h = view.height.toDouble()
			if (node is Node.Text && view is Button) { x += view.paddingLeft; y += view.paddingTop; w -= view.paddingLeft + view.paddingRight; h -= view.paddingTop + view.paddingBottom }
			val left = a.first - origin.first; val top = a.second - origin.second
			val gap = maxOf(maxOf(Math.abs(x - left), Math.abs(y - top)), maxOf(Math.abs(x + w - left - frame.width), Math.abs(y + h - top - frame.height)))
			val run = (view as? TextView)?.takeIf { node is Node.Text }?.let { t -> " run ${t.paint.getRunAdvance(t.text, 0, t.text.length, 0, t.text.length, false, t.text.length)}" } ?: ""
			Log.i(TAG, "frame ${inst.id} device ${x.toInt()},${y.toInt()} ${w.toInt()}x${h.toInt()} dragon $left,$top ${frame.width}x${frame.height} gap $gap$run")
			worst = maxOf(worst, gap)
		}
		return worst
	}

	/** Each framed style node's top-left in device px from the export's root; a node under an unframed box has none. */
	private fun absoluteOrigins(nodes: List<StyledNode>): Map<String, Pair<Double, Double>> {
		val absolute = HashMap<String, Pair<Double, Double>>()
		val seen = HashSet<String>()
		for (s in nodes) {
			if (s.parent != null && s.parent !in seen) throw MarklessHostError("style node \"${s.id}\" precedes its parent")
			seen.add(s.id)
			val f = s.frame ?: continue
			val p = if (s.parent == null) 0.0 to 0.0 else absolute[s.parent] ?: continue
			absolute[s.id] = (p.first + f.x) to (p.second + f.y)
		}
		return absolute
	}

	/**
	 * Ordering a box among its own siblings paints it where its stacking context does when the context is its parent, or when every
	 * box between them is the last painting child of its parent and clips nothing: then nothing of the context paints after it
	 * outside the parent. Anything else is refused by name.
	 */
	private fun checkSiblingOrderSuffices(s: StyledNode, order: StyleWrite.PaintOrder, styled: Assignment) {
		var cursor = s.parent
		while (cursor != null && cursor != order.host) {
			val between = styled.byId[cursor] ?: throw MarklessHostError("\"${s.id}\"'s stacking context ${order.host} is not an ancestor")
			val painting = styled.nodes.filter { it.parent == between.parent && it.frame != null }
			val clips = between.writes.any { it == StyleWrite.PaddingBoxClip || it is StyleWrite.ClipPathInset }
			if (order.bucket < 0 || painting.lastOrNull()?.id != between.id || clips) throw MarklessHostError("\"${s.id}\" paints in ${order.host}'s stacking order past ${between.id}, which has later siblings or clips; not implemented on Android")
			cursor = between.parent
		}
		if (cursor == null) throw MarklessHostError("\"${s.id}\"'s stacking context ${order.host} is not an ancestor")
	}

	private fun paint(view: View, s: StyledNode, styled: Assignment) {
		fun notVisible(n: StyledNode?) = n?.writes?.any { it is StyleWrite.Visibility && it.value != "visible" } == true
		// A text takes its element's visibility, which Dragon writes on the element only.
		val hidden = notVisible(s) || (s.kind == "text" && notVisible(s.parent?.let { styled.byId[it] }))
		var fill: Int? = null
		var styles: List<String>? = null
		var colors: List<Int>? = null
		var radii: List<Double>? = null
		var clipsChildren = false
		var clip: Rect? = null
		for (w in s.writes) when (w) {
			is StyleWrite.BackgroundColor -> fill = w.color.argb
			StyleWrite.BorderWidths -> if (s.borderWidths == null) throw MarklessHostError("\"${s.id}\" writes border widths but has none")
			is StyleWrite.BorderStyles -> styles = w.styles
			is StyleWrite.BorderColors -> colors = w.colors.map { it.argb }
			is StyleWrite.BorderRadius -> radii = w.radii.map { it * dpr }
			is StyleWrite.Font -> (view as? TextView ?: throw MarklessHostError("font on \"${s.id}\", which is not text")).apply {
				// Dragon shapes with fractional, unhinted advances, as Chrome does; hinted whole-pixel advances run wider and wrap.
				paintFlags = paintFlags or Paint.SUBPIXEL_TEXT_FLAG or Paint.LINEAR_TEXT_FLAG
				paint.hinting = Paint.HINTING_OFF
				typeface = fonts.typeface(w.family)
				setTextSize(TypedValue.COMPLEX_UNIT_PX, (w.size * dpr).toFloat())
			}
			is StyleWrite.TextColor -> if (view is DrawingView) view.currentColor = w.color.argb else (view as? TextView ?: throw MarklessHostError("text colour on \"${s.id}\", which is not text")).setTextColor(w.color.argb)
			is StyleWrite.ScrollContainer, StyleWrite.ScrollIndicatorsHidden, is StyleWrite.ScrollBounce -> if (s.id !in scrollers) throw MarklessHostError("\"${s.id}\" has scroll writes but no scroll views")
			// A scroll view clips its own content; any other box clips its children to its padding box.
			StyleWrite.PaddingBoxClip -> if (s.id !in scrollers) clipsChildren = true
			is StyleWrite.ClipPathInset -> {
				val f = s.frame ?: throw MarklessHostError("\"${s.id}\" has a clip-path but no frame")
				fun edge(k: Int, size: Double) = w.edges[k].let { (value, percent) -> if (percent) value / 100 * size else value * dpr }
				val l = edge(3, f.width); val t = edge(0, f.height); val r = f.width - edge(1, f.width); val b = f.height - edge(2, f.height)
				clip = if (r <= l || b <= t) Rect() else Rect(l.roundToInt(), t.roundToInt(), r.roundToInt(), b.roundToInt())
			}
			StyleWrite.ClipText -> {}
			is StyleWrite.PaintOrder -> {}
			is StyleWrite.Visibility -> {}
		}
		if (s.kind != "text") {
			val edges = s.borderWidths
			if (clipsChildren && edges != null && listOf(edges.top, edges.right, edges.bottom, edges.left).any { it != 0.0 }) throw MarklessHostError("\"${s.id}\" clips overflow to its padding box past borders, which is not implemented on Android")
			if (view is MarklessBox) view.clip = clip
			else if (clip != null) throw MarklessHostError("\"${s.id}\" has a clip-path on a ${view.javaClass.simpleName}, which is not implemented on Android")
		}
		if (s.kind == "text") {
			if (view !is Button) view.background = null
			// Text that is not visible keeps its place but neither shows nor reads out, as the web hides it.
			// Only between shown and invisible: a view an arm or `hidden` took out (GONE) stays out.
			if (hidden && view.visibility == View.VISIBLE) view.visibility = View.INVISIBLE
			else if (!hidden && view.visibility == View.INVISIBLE) view.visibility = View.VISIBLE
			return
		}
		// A box that is not visible paints none of its own decorations; its children paint as their own visibility says.
		if (hidden) {
			view.background = null
			return
		}
		val bw = s.borderWidths ?: throw MarklessHostError("element \"${s.id}\" has no border widths")
		s.borderOps?.let { ops ->
			if (radii?.any { it != 0.0 } == true) throw MarklessHostError("\"${s.id}\" has a dashed or dotted border with rounded corners; Dragon draws none")
			view.background = DashedBorder(fill ?: 0, ops, colors?.takeIf { it.size == 4 } ?: throw MarklessHostError("\"${s.id}\" has border operations but not four side colours"))
			return
		}
		val st = styles ?: listOf("none", "none", "none", "none")
		for (x in st) if (x != "none" && x != "hidden" && x != "solid") throw MarklessHostError("\"${s.id}\" has border style \"$x\"; Android draws solid borders only")
		val widths = listOf(bw.top, bw.right, bw.bottom, bw.left).mapIndexed { i, w -> if (st[i] == "solid") w else 0.0 }
		val anyBorder = widths.any { it > 0 }
		if ((fill == null || (fill ushr 24) == 0) && !anyBorder) { view.background = null; return }
		if (anyBorder && (widths.distinct().size != 1 || colors?.distinct()?.size != 1)) {
			if (radii?.any { it != 0.0 } == true) throw MarklessHostError("\"${s.id}\" has unequal border sides with rounded corners; not implemented on Android")
			view.background = SideBorders(fill ?: 0, widths.map { it.toFloat() }, colors ?: throw MarklessHostError("\"${s.id}\" has border sides but no colours"))
			return
		}
		view.background = GradientDrawable().apply {
			setColor(fill ?: 0)
			if (anyBorder) setStroke(widths[0].roundToInt(), colors!![0])
			radii?.let { r -> cornerRadii = r.map { it.toFloat() }.toFloatArray() }
		}
	}

	companion object {
		const val TAG = "MarklessHost"

		/** Dragon's translated `runMarklessLayout`, when the app is built with Dragon's engine; without it a page keeps the size it was exported at. */
		val planLayout: ((String) -> String)? = try {
			val run = Class.forName("dev.dragon.layout.HarnessKt").getMethod("harness_runMarklessLayout", String::class.java)
			({ line: String ->
				try {
					run.invoke(null, line) as String
				} catch (e: java.lang.reflect.InvocationTargetException) {
					throw e.cause ?: e
				}
			})
		} catch (_: ClassNotFoundException) {
			null
		}
		private val HEADINGS = setOf("h1", "h2", "h3", "h4", "h5", "h6")
		private val TICKABLE = setOf("checkbox", "radio")
	}
}

/**
 * Stops typing at a field's `maxlength` as the web does: an insertion is cut to fit, never through a surrogate pair, while
 * text the app sets ([setAppText]) is kept whole.
 */
private class LengthLimit(private val limit: () -> Int?) : InputFilter {
	var appWriting = false

	override fun filter(source: CharSequence, start: Int, end: Int, dest: Spanned, dstart: Int, dend: Int): CharSequence? {
		if (appWriting) return null
		val max = limit() ?: return null
		val room = maxOf(0, max - (dest.length - (dend - dstart)))
		if (end - start <= room) return null
		var cut = room
		if (cut > 0 && Character.isHighSurrogate(source[start + cut - 1])) cut--
		return source.subSequence(start, start + cut)
	}
}

/** Writes text the app set, which the web never shortens to the field's `maxlength`. */
private fun EditText.setAppText(text: String) {
	val limit = filters.filterIsInstance<LengthLimit>().singleOrNull()
	limit?.appWriting = true
	try { setText(text) } finally { limit?.appWriting = false }
}

/**
 * `<input type="range">`: a seek bar whose progress counts the input's steps from its minimum (a thousandth of the range
 * for `step="any"`), its value kept as the web keeps it (`nativeRangeValue`). A move reports the value it lands on once,
 * as the web's input event does while the thumb crosses a step.
 */
class RangeBar(context: Context) : android.widget.SeekBar(context) {
	var onInput: ((String) -> Unit)? = null
	/** Called when a drag ends with the value moved since it began, as the web's `change`. */
	var onCommit: ((String) -> Unit)? = null
	private var startValue = ""
	private var attributes: Map<String, String> = emptyMap()
	private var low = 0.0
	private var unit = 1.0
	private var reported = ""
	private var showing = false

	init {
		// Chrome's unstyled range input is 129 px wide.
		minimumWidth = Math.round(129 * resources.displayMetrics.density)
		setOnSeekBarChangeListener(object : OnSeekBarChangeListener {
			override fun onProgressChanged(bar: android.widget.SeekBar, progress: Int, fromUser: Boolean) {
				if (!fromUser || showing) return
				val landed = valueOf((low + progress * unit).toString())
				if (landed == reported) return
				reported = landed
				onInput?.invoke(landed)
			}
			override fun onStartTrackingTouch(bar: android.widget.SeekBar) {
				startValue = reported
			}
			override fun onStopTrackingTouch(bar: android.widget.SeekBar) {
				if (reported == startValue) return
				startValue = reported
				onCommit?.invoke(reported)
			}
		})
	}

	private fun valueOf(raw: String?) = nativeRangeValue(raw, attributes["min"], attributes["max"], attributes["step"])

	/** Takes the input's attributes: its range, its step and the value the page gives it. */
	fun show(current: Map<String, String>) {
		attributes = HashMap(current)
		low = valueOf(current["min"] ?: "0").toDouble()
		val high = valueOf(current["max"] ?: "100").toDouble()
		val step = current["step"]?.trim()
		unit = if (step?.lowercase() == "any") maxOf((high - low) / 1000, Double.MIN_VALUE) else step?.toDoubleOrNull()?.takeIf { it > 0 } ?: 1.0
		reported = valueOf(current["value"])
		showing = true
		max = Math.round((high - low) / unit).toInt()
		progress = Math.round((reported.toDouble() - low) / unit).toInt()
		showing = false
		isEnabled = current["disabled"] == null
		contentDescription = current["aria-label"]
	}

	companion object {
		/** The attributes that shape the bar or its value. */
		val SHAPE = setOf("min", "max", "step", "value", "disabled", "aria-label")
	}
}

