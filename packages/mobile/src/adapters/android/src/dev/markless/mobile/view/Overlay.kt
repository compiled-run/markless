package dev.markless.mobile.view

import android.app.Activity
import android.content.Context
import android.graphics.Rect
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import dev.markless.mobile.core.EventName
import dev.markless.mobile.core.JournalEntry
import dev.markless.mobile.core.TouchPoint
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.OVERLAY_ATTRIBUTE
import kotlin.math.roundToInt

/**
 * The overlay stack on screen. A modal overlay is lifted into a top layer above the page and the bars, with the page behind
 * hidden from TalkBack; a non-modal one stays in place. While any is open the back gesture is its Escape. When the page has an
 * overlay or a pointer handler, each finger on the screen is reported to the runtime as a touch on the innermost element
 * under it: `pointerdown`, `pointermove`, then `pointerup`, or `pointercancel` once a scroll view takes it.
 */
internal class Overlays(private val host: MarklessHost, private val context: Context, private val dpr: Double) {
	private val reportsTouches = host.payload.nodes.any { it is Node.Element && OVERLAY_ATTRIBUTE in it.attributes } ||
		host.payload.events.any { it.event.pointer } || host.payload.tapPoints

	private val appeared = SystemClock.uptimeMillis()
	/** The next touch's number: from 1 for each screen, one more for each new touch, as Chrome on Android numbers them. */
	private var nextPointer = 1

	/** A finger that is down: its touch's number and where it last was, in window px. */
	private class Finger(val pointerId: Int, var x: Float, var y: Float)

	/** Each finger that is down and not cancelled, by its MotionEvent pointer id. */
	private val fingers = LinkedHashMap<Int, Finger>()
	private var lastTime = appeared

	private class Lifted(val id: String, val view: View, val layer: FrameLayout, val parent: ViewGroup, val index: Int, val params: ViewGroup.LayoutParams?, val background: Drawable?, val padding: IntArray)

	private var lifted: Lifted? = null
	private val open = LinkedHashSet<String>()
	private var back: OnBackInvokedCallback? = null

	private fun activity(): Activity = context as? Activity ?: throw MarklessHostError("an overlay needs an Activity for its top layer and back gesture")

	/** Shows what the runtime already lists as open when the page mounts. */
	fun mount() {
		for ((id, modal) in host.runtime.overlays()) if (id !in open) show(id, true, modal)
	}

	fun show(id: String, isOpen: Boolean, modal: Boolean) {
		val activity = activity()
		if (isOpen) {
			if (modal) lift(id, activity)
			open.add(id)
			if (back == null) {
				val callback = OnBackInvokedCallback {
					val top = host.runtime.overlays().lastOrNull()?.first ?: return@OnBackInvokedCallback
					host.apply(host.runtime.dispatch(top, EventName.Dismiss, reason = "escape"))
				}
				activity.onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
				back = callback
			}
		} else {
			if (lifted?.id == id) drop(activity)
			open.remove(id)
			if (open.isEmpty()) back?.let { activity.onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it); back = null }
		}
	}

	private fun lift(id: String, activity: Activity) {
		if (lifted != null) throw MarklessHostError("a second modal overlay over \"$id\" has no top layer yet")
		val view = host.view(id)
		val content = activity.findViewById<ViewGroup>(android.R.id.content)
		val parent = view.parent as? ViewGroup ?: throw MarklessHostError("overlay \"$id\" has no place in the page")
		val place = Lifted(id, view, FrameLayout(context), parent, parent.indexOfChild(view), view.layoutParams, view.background, intArrayOf(view.paddingLeft, view.paddingTop, view.paddingRight, view.paddingBottom))
		parent.removeView(view)
		place.layer.apply {
			// The same backdrop as the dialog layer; a press on it is the overlay's, so it is consumed here.
			setBackgroundColor(0x1A000000)
			isClickable = true
			setOnApplyWindowInsetsListener { v, insets ->
				val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
				v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
				insets
			}
		}
		view.setBackgroundColor(0xFFFFFFFF.toInt())
		val pad = (16 * dpr).roundToInt()
		view.setPadding(pad, pad, pad, pad)
		place.layer.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
		content.addView(place.layer, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		for (i in 0 until content.childCount) content.getChildAt(i).takeIf { it !== place.layer }?.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
		lifted = place
		place.layer.requestApplyInsets()
	}

	private fun drop(activity: Activity) {
		val place = lifted ?: return
		val content = activity.findViewById<ViewGroup>(android.R.id.content)
		place.layer.removeView(place.view)
		content.removeView(place.layer)
		for (i in 0 until content.childCount) content.getChildAt(i).importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
		place.view.background = place.background
		place.view.setPadding(place.padding[0], place.padding[1], place.padding[2], place.padding[3])
		val index = minOf(place.index, place.parent.childCount)
		if (place.params != null) place.parent.addView(place.view, index, place.params) else place.parent.addView(place.view, index)
		lifted = null
	}

	/** Called with every touch in window coordinates before the views see it; nothing is consumed. */
	fun touch(event: MotionEvent) {
		if (!reportsTouches) return
		lastTime = event.eventTime
		when (event.actionMasked) {
			MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
				// A new gesture: a finger left over from one whose end never arrived is cancelled first.
				if (event.actionMasked == MotionEvent.ACTION_DOWN) cancelTouches()
				val i = event.actionIndex
				val finger = Finger(nextPointer++, event.getX(i), event.getY(i))
				val target = hit(finger.x.roundToInt(), finger.y.roundToInt()) ?: return
				fingers[event.getPointerId(i)] = finger
				report(EventName.PointerDown, target, finger)
			}
			MotionEvent.ACTION_MOVE -> for (i in 0 until event.pointerCount) {
				val finger = fingers[event.getPointerId(i)] ?: continue
				if (finger.x == event.getX(i) && finger.y == event.getY(i)) continue
				finger.x = event.getX(i); finger.y = event.getY(i)
				if (report(EventName.PointerMove, hit(finger.x.roundToInt(), finger.y.roundToInt()) ?: continue, finger)) return
			}
			MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
				val i = event.actionIndex
				val finger = fingers.remove(event.getPointerId(i)) ?: return
				finger.x = event.getX(i); finger.y = event.getY(i)
				report(EventName.PointerUp, hit(finger.x.roundToInt(), finger.y.roundToInt()) ?: return, finger)
			}
			MotionEvent.ACTION_CANCEL -> cancelTouches()
		}
	}

	/** Sends `pointercancel` for every finger that is down; their later moves and lifts are not reported. */
	fun cancelTouches() {
		val cancelled = fingers.values.toList()
		fingers.clear()
		for (finger in cancelled) if (report(EventName.PointerCancel, hit(finger.x.roundToInt(), finger.y.roundToInt()) ?: continue, finger)) return
	}

	/** Dispatches one touch event; true when it navigated, after which this screen reports nothing more. */
	private fun report(name: EventName, target: String, finger: Finger): Boolean {
		val point = TouchPoint(finger.pointerId.toDouble(), finger.x / dpr, finger.y / dpr, (lastTime - appeared).toDouble())
		val journal = host.runtime.dispatch(target, name, point = point)
		val navigated = journal.any { it is JournalEntry.Navigate }
		if (navigated) fingers.clear()
		host.apply(journal)
		return navigated
	}

	/** The innermost element under the point; the top layer stands for its overlay's box, and the rest of the screen for the root. */
	private fun hit(x: Int, y: Int): String? {
		val nodes = host.elementNodes()
		val rect = Rect()
		fun deepest(v: View): String? {
			if (v.visibility != View.VISIBLE || !v.getGlobalVisibleRect(rect) || !rect.contains(x, y)) return null
			if (v is ViewGroup) for (i in v.childCount - 1 downTo 0) deepest(v.getChildAt(i))?.let { return it }
			return nodes[v]
		}
		lifted?.let { return deepest(it.layer) ?: it.id }
		val content = (context as? Activity)?.findViewById<ViewGroup>(android.R.id.content) ?: return null
		return deepest(content) ?: host.payload.nodes.first().id
	}
}
