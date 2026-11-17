package dev.markless.mobile.view

import android.content.Context
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.text.Editable
import android.text.TextWatcher
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import dev.markless.mobile.core.EventName
import dev.markless.mobile.core.Instance
import dev.markless.mobile.core.JournalEntry
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.Payload
import dev.markless.mobile.core.Runtime
import dev.markless.mobile.core.Store
import dev.markless.mobile.style.StyleExport
import dev.markless.mobile.style.StyleWrite
import dev.markless.mobile.style.StyledNode
import kotlin.math.roundToInt

class MarklessHostError(message: String) : RuntimeException(message)

/** Looks up a font face by the id a style export names it with (`sha256:<hex>` of the font file). */
fun interface FontSource {
	fun typeface(id: String): Typeface
}

/** Faces bundled as APK assets at `markless-fonts/<hex>.ttf`, the hex of the font file's SHA-256. */
class AssetFonts(private val context: Context) : FontSource {
	private val cache = HashMap<String, Typeface>()
	override fun typeface(id: String): Typeface = cache.getOrPut(id) {
		if (!id.startsWith("sha256:")) throw MarklessHostError("font id \"$id\" is not a sha256 id")
		Typeface.createFromAsset(context.assets, "markless-fonts/${id.removePrefix("sha256:")}.ttf")
	}
}

/**
 * Builds the retained views for one payload and keeps them current. After [root] is built, views change only through
 * journal entries from the [runtime]. Pass the Dragon style export to place and paint the views; without it children stack.
 */
class MarklessHost(
	private val context: Context,
	payloadBytes: ByteArray,
	styleExportBytes: ByteArray? = null,
	private val fonts: FontSource = AssetFonts(context),
	store: Store = PreferencesStore(context),
	/** The route params the page opens with. */
	params: Map<String, String> = emptyMap(),
) {
	val payload: Payload = Payload.decode(payloadBytes)
	val runtime = Runtime(payload, store, params)
	val style: StyleExport? = styleExportBytes?.let { StyleExport.decode(it) }
	private val order = payload.nodes.withIndex().associate { it.value.id to it.index }
	private val events = payload.events.groupBy { it.host }
	private val views = HashMap<String, View>()
	private val built = HashMap<String, Instance>()
	private val textViews = HashMap<String, TextView>()
	private var assignment = style?.initial ?: 0
	private val expanded = HashMap<View, Boolean?>()
	/** Each view's current attributes, for the relations and roles the accessibility delegate reports. */
	private val attrs = HashMap<String, HashMap<String, String>>()
	private val dpr = context.resources.displayMetrics.density.toDouble()
	private val absolutes: List<Map<String, Pair<Double, Double>>> = style?.let {
		if (Math.abs(dpr - it.dpr) > 1e-3) throw MarklessHostError("style export is for pixel ratio ${it.dpr}; this device is $dpr")
		it.assignments.map { a -> absoluteOrigins(a.nodes) }
	} ?: emptyList()

	/** The root's frame inside the viewport, when a style export placed it. */
	var rootFrame: Rect? = null
		private set

	/** Builds the page a `navigate` entry names, from scratch; required for a payload with links. */
	var onNavigate: ((route: String, params: Map<String, String>) -> Unit)? = null

	/** Called with each journal after it is applied. */
	var onJournal: ((List<JournalEntry>) -> Unit)? = null

	val root: View

	init {
		val top = payload.nodes.firstOrNull() as? Node.Element ?: throw MarklessHostError("payload does not start with its root element")
		if (top.parent != null || top.arm != null) throw MarklessHostError("the root element has a parent or sits in an arm")
		if (payload.nodes.count { it.parent == null } != 1) throw MarklessHostError("payload has more than one root")
		buildShown()
		root = views.getValue(top.id)
		refreshRelations()
	}

	fun view(id: String): View = views[id] ?: throw MarklessHostError("no view for \"$id\"")

	fun hasView(id: String): Boolean = id in views

	/** Every instance id that has a retained view. */
	fun viewIds(): Set<String> = built.keys.toSet()

	fun textView(id: String): TextView = textViews[id] ?: throw MarklessHostError("no text view for \"$id\"")

	/** The journal applier: the only code that changes a retained view after the first build. */
	fun apply(journal: List<JournalEntry>) {
		for (entry in journal) {
			when (entry) {
				is JournalEntry.Text -> textView(entry.node).text = entry.value
				is JournalEntry.Attribute -> attribute(entry.node, entry.name, entry.value)
				is JournalEntry.Property -> {
					val field = view(entry.node) as? EditText ?: throw MarklessHostError("journal sets the value of \"${entry.node}\", which is not an input")
					if (field.text.toString() != entry.value) { field.setText(entry.value); field.setSelection(entry.value.length) }
				}
				is JournalEntry.State -> style?.let { st ->
					assignment = st.next(assignment, st.stateFor(entry.node), entry.value)
					for (inst in built.values.sortedBy { order.getValue(it.node.id) }) place(inst, views.getValue(inst.id), st)
					root.requestLayout()
				}
				is JournalEntry.Arm -> {
					if (runtime.node(entry.node) !is Node.Branch) throw MarklessHostError("journal names \"${entry.node}\", which is not a branch")
					rebuild()
				}
				is JournalEntry.Navigate -> {
					Log.i(TAG, "journal ${entry.toJson()}")
					onJournal?.invoke(journal)
					(onNavigate ?: throw MarklessHostError("navigate to ${entry.node} with no page builder")).invoke(entry.node, entry.params)
					return
				}
				is JournalEntry.Rows -> {
					if (runtime.node(entry.node) !is Node.Repeat) throw MarklessHostError("journal names \"${entry.node}\", which is not a list")
					rebuild()
				}
			}
			Log.i(TAG, "journal ${entry.toJson()}")
		}
		refreshRelations()
		onJournal?.invoke(journal)
	}

	/** After an arm or rows entry: drop instances no longer shown, build the new ones from current values, then put each parent's children in order. */
	private fun rebuild() {
		removeHidden()
		buildShown()
		for (v in views.values.toList()) if (v is MarklessBox) reorder(v)
	}

	private fun shownInstances(): List<Instance> = payload.nodes.filter { it is Node.Element || it is Node.Text }.flatMap(runtime::instances)

	private fun removeHidden() {
		val live = shownInstances().mapTo(HashSet()) { it.id }
		for (inst in built.values.sortedByDescending { order.getValue(it.node.id) }) {
			if (inst.id in live) continue
			val view = views.remove(inst.id)!!
			built.remove(inst.id)
			textViews.remove(inst.id)
			if (inst.node is Node.Text && view is Button) continue
			expanded.remove(view)
			(view.parent as? ViewGroup)?.let { p ->
				(p as? MarklessBox)?.frames?.remove(view)
				p.removeView(view)
			}
		}
	}

	private fun buildShown() {
		for (inst in shownInstances()) {
			if (inst.id in views) continue
			val view = when (val node = inst.node) {
				is Node.Element -> element(node, inst)
				is Node.Text -> text(node, inst)
				else -> continue
			}
			views[inst.id] = view
			built[inst.id] = inst
			val parentId = parentOf(inst)
			if (parentId != null && view !== views[parentId]) {
				val parent = views[parentId] as? MarklessBox ?: throw MarklessHostError("\"${inst.id}\" is inside \"$parentId\", which cannot hold children on Android")
				parent.addView(view)
				reorder(parent)
			}
			style?.let { place(inst, view, it) }
		}
	}

	/** The instance id of [inst]'s parent: in the same row when the parent is a row node too. */
	private fun parentOf(inst: Instance): String? {
		val p = inst.node.parent ?: return null
		return if (runtime.node(p).row != null) "$p@${inst.rowKey ?: throw MarklessHostError("\"${inst.id}\" is outside the rows of its parent \"$p\"")}" else p
	}

	/** Where an instance sits among its siblings: document order, with a list's rows at the list's place, in row order. */
	private fun position(inst: Instance, rowIndex: Map<String, Map<String, Int>>): List<Int> {
		val r = inst.node.row ?: return listOf(order.getValue(inst.node.id))
		return listOf(order.getValue(r), rowIndex.getValue(r).getValue(inst.rowKey!!), order.getValue(inst.node.id))
	}

	/** Moves [box]'s retained children into position order; the views are kept, only their places change. */
	private fun reorder(box: MarklessBox) {
		val rowIndex = runtime.rows().associate { (id, keys) -> id to keys.withIndex().associate { it.value to it.index } }
		val ids = HashMap<View, Instance>().apply { for ((id, v) in views) if (v.parent === box) put(v, built.getValue(id)) }
		val current = (0 until box.childCount).map { box.getChildAt(it) }
		val wanted = current.sortedWith { a, b ->
			val pa = position(ids.getValue(a), rowIndex); val pb = position(ids.getValue(b), rowIndex)
			(0 until minOf(pa.size, pb.size)).map { pa[it].compareTo(pb[it]) }.firstOrNull { it != 0 } ?: pa.size.compareTo(pb.size)
		}
		if (wanted == current) return
		box.removeAllViews()
		for (v in wanted) box.addView(v)
	}

	private fun named(view: View, id: String, heading: Boolean = false, control: Boolean = false, link: Boolean = false) {
		view.isAccessibilityHeading = heading
		view.accessibilityDelegate = object : View.AccessibilityDelegate() {
			override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
				super.onInitializeAccessibilityNodeInfo(host, info)
				info.viewIdResourceName = id
				if (control) info.className = Button::class.java.name
				val current = attrs[id].orEmpty()
				if (current["role"] == "switch") {
					info.className = "android.widget.Switch"
					info.isCheckable = true
					info.isChecked = current["aria-checked"] == "true"
				}
				current["aria-describedby"]?.let { info.hintText = textOf(it) }
				if (link) info.extras.putCharSequence("AccessibilityNodeInfo.roleDescription", "link")
				val state = expanded[host] ?: return
				if (Build.VERSION.SDK_INT >= 36) info.expandedState = if (state) AccessibilityNodeInfo.EXPANDED_STATE_FULL else AccessibilityNodeInfo.EXPANDED_STATE_COLLAPSED
				info.addAction(if (state) AccessibilityNodeInfo.AccessibilityAction.ACTION_COLLAPSE else AccessibilityNodeInfo.AccessibilityAction.ACTION_EXPAND)
			}
		}
	}

	private fun element(node: Node.Element, inst: Instance): View {
		if (node.row != null && events[node.id].orEmpty().isNotEmpty()) throw MarklessHostError("\"${node.id}\" handles events inside a list row; native-view/0 has no row handlers")
		// A Button holds one text run; a button with an element inside (a switch's thumb) is a box that reads as a Button.
		val holdsElements = payload.nodes.any { it.parent == node.id && it is Node.Element }
		val view = when (if (node.element == "button" && holdsElements) "box-button" else node.element) {
			"box-button" -> MarklessBox(context).apply { isClickable = true; isFocusable = true; named(this, inst.id, control = true) }
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
			"input" -> EditText(context).apply {
				isSingleLine = true
				includeFontPadding = false
				if (style != null) { background = null; setPadding(0, 0, 0, 0) }
				named(this, inst.id)
			}
			else -> MarklessBox(context).apply { named(this, inst.id, heading = node.element in HEADINGS, control = events[node.id].orEmpty().any { it.event == EventName.Activate }, link = node.element == "a") }
		}
		views[inst.id] = view
		for (b in node.bindings) if (b.property) (view as? EditText ?: throw MarklessHostError("\"${node.id}\" binds ${b.name} but is not an input")).setText(runtime.property(b, inst.scope))
		for (e in events[node.id].orEmpty()) when (e.event) {
			EventName.Activate -> view.setOnClickListener { apply(runtime.dispatch(e.host, EventName.Activate)) }
			EventName.Input -> (view as? EditText ?: throw MarklessHostError("input event on \"${node.id}\", which is not an input")).addTextChangedListener(object : TextWatcher {
				override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
				override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
				override fun afterTextChanged(s: Editable) {
					val text = s.toString()
					// A property entry the applier just wrote reads back as the runtime's own value: not an edit.
					if (node.bindings.any { it.property && it.name == "value" } && runtime.property(node.id, "value") == text) return
					apply(runtime.dispatch(e.host, EventName.Input, text))
				}
			})
		}
		for ((name, value) in node.attributes) if (name != "class") attribute(inst.id, name, value)
		for (b in node.bindings) if (!b.property) attribute(inst.id, b.name, runtime.attribute(b, inst.scope))
		return view
	}

	private fun text(node: Node.Text, inst: Instance): View {
		val parent = views.getValue(parentOf(inst)!!)
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

	/** Attributes per the contract's Android mapping; `class` reaches views only through Dragon's style states, and any other attribute is ignored. */
	private fun attribute(id: String, name: String, value: String?) {
		val view = view(id)
		val current = attrs.getOrPut(id) { HashMap() }
		if (value == null) current.remove(name) else current[name] = value
		when (name) {
			// A label names its control, so TalkBack reads it there and not a second time on the label; a press on it activates the control.
			"for" -> if (value != null) {
				view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
				view.setOnClickListener { views[value]?.performClick() }
			}
			"aria-label" -> view.contentDescription = value
			"disabled" -> view.isEnabled = value == null
			"aria-pressed", "aria-selected" -> view.isSelected = value == "true"
			"aria-expanded" -> expanded[view] = when (value) { "true" -> true; "false" -> false; else -> null }
			"aria-hidden" -> view.importantForAccessibility = if (value == "true") View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS else View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
			// With a style export Dragon decides visibility (a hidden element has no frame); the stacking layout reads `hidden`.
			"hidden" -> if (style == null) view.visibility = if (value != null) View.GONE else View.VISIBLE
		}
	}

	/** The text the elements named by a space-separated id list show, in view order. */
	private fun textOf(ids: String): String = ids.split(' ').mapNotNull { views[it] }.joinToString(" ") { textWithin(it) }

	private fun textWithin(view: View): String = when (view) {
		is TextView -> view.text.toString()
		is ViewGroup -> (0 until view.childCount).map { textWithin(view.getChildAt(it)) }.filter { it.isNotEmpty() }.joinToString(" ")
		else -> ""
	}

	/** `aria-labelledby` as the content description, kept current after every journal. */
	private fun refreshRelations() {
		for ((id, current) in attrs) {
			val view = views[id] ?: continue
			if (current["aria-label"] == null) current["aria-labelledby"]?.let { view.contentDescription = textOf(it) }
		}
	}

	private fun place(inst: Instance, view: View, style: StyleExport) {
		val node = inst.node
		val styled = style.assignments[assignment]
		val s = styled.byId[inst.id] ?: throw MarklessHostError("style export has no node \"${inst.id}\"")
		if (s.kind != (if (node is Node.Text) "text" else "element")) throw MarklessHostError("style node \"${inst.id}\" is a ${s.kind}")
		val absolute = absolutes[assignment]
		val frame = s.frame
		val origin = absolute[s.id]
		// Dragon gives an element it does not render (`display: none`, `[hidden]`), and everything inside it, no frame.
		if (frame == null || origin == null) {
			view.visibility = View.GONE
			return
		}
		view.visibility = View.VISIBLE
		val (ax, ay) = origin
		val parentId = parentOf(inst)
		if (node is Node.Text && view is Button) {
			val (bx, by) = absolute.getValue(parentId!!)
			val box = styled.byId.getValue(parentId).frame!!
			view.setPadding((ax - bx).roundToInt(), (ay - by).roundToInt(), (bx + box.width).roundToInt() - (ax + frame.width).roundToInt(), (by + box.height).roundToInt() - (ay + frame.height).roundToInt())
		} else {
			val (ox, oy) = parentId?.let { absolute.getValue(it) }?.let { it.first.roundToInt() to it.second.roundToInt() } ?: (0 to 0)
			// Text rounds outward: a run a fraction of a pixel narrower than its frame wraps.
			val rect = if (node is Node.Text) {
				Rect(Math.floor(ax).toInt() - ox, Math.floor(ay).toInt() - oy, Math.ceil(ax + frame.width).toInt() - ox, Math.ceil(ay + frame.height).toInt() - oy)
			} else {
				Rect(ax.roundToInt() - ox, ay.roundToInt() - oy, (ax + frame.width).roundToInt() - ox, (ay + frame.height).roundToInt() - oy)
			}
			if (parentId == null) rootFrame = rect else (views.getValue(parentId) as MarklessBox).frames[view] = rect
		}
		paint(view, s)
	}

	/** After layout: the largest gap, in device px, between any edge of a view's laid-out box (relative to the root) and its Dragon frame. */
	fun frameDeviation(): Double {
		val style = style ?: throw MarklessHostError("no style export to compare frames with")
		val absolute = absolutes[assignment]
		val styled = style.assignments[assignment]
		val origin = absolute.getValue(payload.nodes.first().id)
		val rootAt = IntArray(2).also { root.getLocationInWindow(it) }
		var worst = 0.0
		for (inst in built.values.sortedBy { order.getValue(it.node.id) }) {
			val node = inst.node
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

	private fun paint(view: View, s: StyledNode) {
		var fill: Int? = null
		var styles: List<String>? = null
		var colors: List<Int>? = null
		var radii: List<Double>? = null
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
			is StyleWrite.TextColor -> (view as? TextView ?: throw MarklessHostError("text colour on \"${s.id}\", which is not text")).setTextColor(w.color.argb)
		}
		if (s.kind == "text") {
			if (view !is Button) view.background = null
			return
		}
		val bw = s.borderWidths ?: throw MarklessHostError("element \"${s.id}\" has no border widths")
		val st = styles ?: listOf("none", "none", "none", "none")
		for (x in st) if (x != "none" && x != "hidden" && x != "solid") throw MarklessHostError("\"${s.id}\" has border style \"$x\"; Android draws solid borders only")
		val widths = listOf(bw.top, bw.right, bw.bottom, bw.left).mapIndexed { i, w -> if (st[i] == "solid") w else 0.0 }
		val anyBorder = widths.any { it > 0 }
		if (anyBorder && (widths.distinct().size != 1 || colors?.distinct()?.size != 1)) throw MarklessHostError("\"${s.id}\" has unequal border sides; not implemented on Android")
		if ((fill == null || (fill ushr 24) == 0) && !anyBorder) { view.background = null; return }
		view.background = GradientDrawable().apply {
			setColor(fill ?: 0)
			if (anyBorder) setStroke(widths[0].roundToInt(), colors!![0])
			radii?.let { r -> cornerRadii = r.map { it.toFloat() }.toFloatArray() }
		}
	}

	companion object {
		const val TAG = "MarklessHost"
		private val HEADINGS = setOf("h1", "h2", "h3", "h4", "h5", "h6")
	}
}
