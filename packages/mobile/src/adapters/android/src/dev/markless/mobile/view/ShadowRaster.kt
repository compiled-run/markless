package dev.markless.mobile.view

import android.graphics.Bitmap
import dev.markless.mobile.style.ShadowBox
import dev.markless.mobile.style.ShadowPaint
import java.lang.reflect.InvocationTargetException
import java.nio.ByteBuffer

/** A shadow layer as a premultiplied bitmap at a device px offset from the box's top-left; null when nothing shows. */
typealias ShadowBitmap = Triple<Bitmap, Int, Int>

/**
 * Dragon's translated paint-shadow.ts (its *Over layers: each shadow blitted onto the backdrop as Chrome blits it) and paint-radius.ts,
 * found by name as the plan layout is: the app links them when it is built with Dragon's engine.
 */
internal class ShadowRaster private constructor() {
	private fun type(name: String): Class<*> = Class.forName("dev.dragon.layout.$name")
	private val d = java.lang.Double.TYPE
	private val z = java.lang.Boolean.TYPE
	private val list = ArrayList::class.java
	private val roundedShape = type("PaintRadiusKt").getMethod("paintRadius_roundedShape", d, d, d, d, d, d, list, list, d, type("RadiusFaults"))
	private val outerOver = type("PaintShadowKt").getMethod("paintShadow_outerShadowLayerOver", d, d, d, d, list, z, list, d, type("ShadowFaults"), list)
	private val insetOver = type("PaintShadowKt").getMethod("paintShadow_insetShadowLayerOver", d, d, d, d, list, list, list, d, type("ShadowFaults"), list)
	private val radiusLength = type("RadiusLength").getConstructor(z, d)
	private val shadowInput = type("ShadowInput").getConstructor(z, d, d, d, d, d, d, d, d)
	private val backdropFill = type("BackdropFill").getConstructor(d, d, d, d, list, d, d, d, d)
	private val radiusFaults = type("RadiusFaults").getConstructor(z, z).newInstance(false, false)
	private val shadowFaults = type("ShadowFaults").getConstructor(z, z, z).newInstance(false, false, false)
	private val layer = type("ShadowLayer")
	private val layerEdges = listOf("getLeft", "getTop", "getRight", "getBottom").map { layer.getMethod(it) }
	private val layerRgba = layer.getMethod("getRgba")

	private fun call(f: java.lang.reflect.Method, vararg args: Any): Any = try {
		f.invoke(null, *args)
	} catch (e: InvocationTargetException) {
		throw e.cause ?: e
	}

	@Suppress("UNCHECKED_CAST")
	private fun shape(b: ShadowBox, dpr: Double): List<Double> = call(
		roundedShape, b.edges[0], b.edges[1], b.edges[2], b.edges[3], b.size[0], b.size[1], ArrayList(b.borders),
		ArrayList(b.radii.map { radiusLength.newInstance(false, it) }), dpr, radiusFaults,
	) as List<Double>

	private fun fill(b: ShadowBox, radii: List<Double>): Any = backdropFill.newInstance(
		b.edges[0], b.edges[1], b.edges[2], b.edges[3], ArrayList(radii.subList(0, 8)), b.background.r.toDouble(), b.background.g.toDouble(),
		b.background.b.toDouble(), b.background.alpha.toDouble(),
	)

	/** The outer and the inset shadow layers. */
	fun raster(p: ShadowPaint): Pair<ShadowBitmap?, ShadowBitmap?> {
		val own = shape(p.box, p.dpr)
		val backdrop = p.backdrop.map { fill(it, shape(it, p.dpr)) }
		val shadows = ArrayList(p.shadows.map { shadowInput.newInstance(it.inset, it.x, it.y, it.blur, it.spread, it.color.r.toDouble(), it.color.g.toDouble(), it.color.b.toDouble(), it.color.alpha.toDouble()) })
		val e = p.box.edges
		val outer = if (!p.hasOuter) null else bitmap(call(outerOver, e[0], e[1], e[2], e[3], ArrayList(own.subList(0, 8)), p.box.background.alpha == 255, shadows, p.dpr, shadowFaults, ArrayList(backdrop)), e)
		val inset = if (!p.hasInset) null else bitmap(call(insetOver, e[0], e[1], e[2], e[3], ArrayList(p.box.borders), ArrayList(own.subList(8, 16)), shadows, p.dpr, shadowFaults, ArrayList(backdrop + fill(p.box, own))), e)
		return outer to inset
	}

	@Suppress("UNCHECKED_CAST")
	private fun bitmap(layer: Any, box: List<Double>): ShadowBitmap? {
		val (l, t, r, b) = layerEdges.map { it.invoke(layer) as Double }
		val w = whole(r - l)
		val h = whole(b - t)
		if (w <= 0 || h <= 0) return null
		val bytes = layerRgba.invoke(layer) as ByteArray
		if (bytes.size != w * h * 4) throw MarklessHostError("a shadow layer of ${bytes.size} bytes is not ${w}x$h RGBA")
		val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
		bitmap.copyPixelsFromBuffer(ByteBuffer.wrap(bytes))
		return Triple(bitmap, whole(l - box[0]), whole(t - box[1]))
	}

	private fun whole(v: Double): Int {
		if (v != Math.floor(v)) throw MarklessHostError("a shadow layer edge $v is not a whole device px")
		return v.toInt()
	}

	companion object {
		/** Null when the app is built without Dragon's engine. */
		val dragon: ShadowRaster? by lazy {
			try {
				ShadowRaster()
			} catch (_: ClassNotFoundException) {
				null
			}
		}
	}
}
