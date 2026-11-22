package dev.markless.mobile.view

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorSpace
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.media.ExifInterface
import android.view.View
import dev.markless.mobile.core.Drawing
import dev.markless.mobile.style.Frame
import dev.markless.mobile.style.LoadedImageSpec
import dev.markless.mobile.style.RuntimeImagePaint
import dev.markless.mobile.style.RuntimeImagePlace
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/** A loaded image and its natural size in CSS px: a decoded bitmap (its pixel size), or an SVG file's drawing, rasterized where drawn. */
sealed interface LoadedPicture {
	val width: Double
	val height: Double

	class Bitmap(val bitmap: android.graphics.Bitmap) : LoadedPicture {
		override val width get() = bitmap.width.toDouble()
		override val height get() = bitmap.height.toDouble()
	}

	class Svg(val drawing: Drawing, override val width: Double, override val height: Double) : LoadedPicture

	companion object {
		/** The image at [src]: a file the app packaged, or a photo the device took (a `file:` URL); null when there is none or it does not decode. */
		fun load(context: Context, src: String, packaged: Map<String, PackagedImage>): LoadedPicture? {
			val asset = packaged[src]
			if (asset != null) {
				asset.drawing?.let { drawing ->
					// An SVG file with only a viewBox has a ratio and no size; its viewBox gives that ratio.
					val box = drawing.viewBox
					val width = asset.width ?: box?.getOrNull(2) ?: return null
					val height = asset.height ?: box?.getOrNull(3) ?: return null
					return Svg(drawing, width, height)
				}
				val file = asset.file ?: return null
				return decoded(context.assets.open(file).use { it.readBytes() })?.let { Bitmap(oriented(it, asset.orientation)) }
			}
			if (!src.startsWith("file:")) return null
			val path = android.net.Uri.parse(src).path ?: return null
			val bytes = runCatching { java.io.File(path).readBytes() }.getOrNull() ?: return null
			val orientation = runCatching { ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) }.getOrDefault(1)
			return decoded(bytes)?.let { Bitmap(oriented(it, orientation)) }
		}

		/** The bytes decoded into 8-bit sRGB, as the browser draws them. */
		private fun decoded(bytes: ByteArray): android.graphics.Bitmap? = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply {
			inPreferredConfig = android.graphics.Bitmap.Config.ARGB_8888
			inPreferredColorSpace = ColorSpace.get(ColorSpace.Named.SRGB)
		})?.let { if (it.config == android.graphics.Bitmap.Config.ARGB_8888) it else it.copy(android.graphics.Bitmap.Config.ARGB_8888, false) }
	}
}

/**
 * What an img whose src the app sets as it runs draws: nothing while its first image loads, the last image that loaded (kept while
 * the next one loads), or Chrome's no-image outline when it has no src or its image did not load.
 */
sealed interface LoadedImageState {
	data object Waiting : LoadedImageState
	class Shown(val picture: LoadedPicture) : LoadedImageState
	data object Missing : LoadedImageState
}

private val loader = Executors.newSingleThreadExecutor()

/** Blink's no-image outline colour, Color::kLightGray, for an img whose image did not load. */
private const val NO_IMAGE_OUTLINE = 0xFFC0C0C0.toInt()

/**
 * Draws an img's loaded image into the rect Dragon's paint gives for its size, clipped to the drawn part of the content box and its
 * rounded edge; with no image, the no-image outline.
 */
class LoadedImageView(context: Context, private val packaged: Map<String, PackagedImage>) : View(context) {
	var state: LoadedImageState = LoadedImageState.Waiting
		private set
	/** The src last asked for: a load that finishes for another src is dropped. */
	private var wanted: String? = null
	/** The img's spec, place and device px per CSS px, from the style export. */
	var spec: Triple<LoadedImageSpec, RuntimeImagePlace, Double>? = null
		set(value) { field = value; invalidate() }
	/** The img's corner radii (eight, device px) and border widths (top, right, bottom, left), for the rounded edge of its content box. */
	var edge: Pair<List<Double>?, List<Double>> = null to listOf(0.0, 0.0, 0.0, 0.0)
		set(value) { field = value; invalidate() }

	init {
		importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
	}

	/** The runtime's src for the img now; a new src loads off the main thread. */
	fun show(src: String?) {
		if (src != null && src == wanted) return
		wanted = src
		if (src == null) return move(LoadedImageState.Missing)
		loader.execute {
			val picture = runCatching { LoadedPicture.load(context, src, packaged) }.getOrNull()
			post { if (wanted == src) move(picture?.let { LoadedImageState.Shown(it) } ?: LoadedImageState.Missing) }
		}
	}

	private fun move(next: LoadedImageState) {
		state = next
		invalidate()
	}

	override fun onDraw(canvas: Canvas) {
		val (image, place, scale) = spec ?: return
		// The view sits at its frame's origin rounded to a device px, as the host places every box.
		val ox = place.originX.roundToInt()
		val oy = place.originY.roundToInt()
		fun local(r: Frame) = RectF((r.x - ox).toFloat(), (r.y - oy).toFloat(), (r.x + r.width - ox).toFloat(), (r.y + r.height - oy).toFloat())
		when (val now = state) {
			LoadedImageState.Waiting -> return
			LoadedImageState.Missing -> {
				val c = runCatching { RuntimeImagePaint.paint(image, place, 0.0, 0.0, scale).second }.getOrNull() ?: return
				if (c.width <= 2 || c.height <= 2) return
				val paint = Paint().apply { style = Paint.Style.FILL; isAntiAlias = false; color = image.outline?.argb ?: NO_IMAGE_OUTLINE }
				for (band in listOf(Frame(c.x, c.y, c.width, 1.0), Frame(c.x, c.y + c.height - 1, c.width, 1.0), Frame(c.x, c.y + 1, 1.0, c.height - 2), Frame(c.x + c.width - 1, c.y + 1, 1.0, c.height - 2))) canvas.drawRect(local(band), paint)
			}
			is LoadedImageState.Shown -> {
				val picture = now.picture
				val (destAt, contentAt, drawnAt) = runCatching { RuntimeImagePaint.paint(image, place, picture.width, picture.height, scale) }.getOrNull() ?: return
				val drawn = drawnAt ?: return
				val dest = local(destAt)
				val saved = canvas.save()
				canvas.clipRect(local(drawn))
				val (radii, borders) = edge
				if (radii != null && radii.any { it != 0.0 }) {
					// The content box's rounded edge: each outer radius less the border on its side.
					val inner = FloatArray(8) { k -> maxOf(0.0, radii[k] - borders[RADIUS_SIDES[k]]).toFloat() }
					canvas.clipPath(Path().apply { addRoundRect(local(contentAt), inner, Path.Direction.CW) })
				}
				when (picture) {
					is LoadedPicture.Bitmap -> canvas.drawBitmap(picture.bitmap, null, dest, Paint(if (image.pixelated) 0 else Paint.FILTER_BITMAP_FLAG))
					is LoadedPicture.Svg -> {
						val view = DrawingView(context, picture.drawing, 16.0 * resources.displayMetrics.density, fillsBox = true)
						val w = dest.width().roundToInt()
						val h = dest.height().roundToInt()
						view.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
						view.layout(0, 0, w, h)
						canvas.translate(dest.left, dest.top)
						view.draw(canvas)
					}
				}
				canvas.restoreToCount(saved)
			}
		}
	}
}

/** The border side (top, right, bottom, left) each corner radius (x then y, from top-left clockwise) is inset by. */
private val RADIUS_SIDES = intArrayOf(3, 0, 1, 0, 1, 2, 3, 2)
