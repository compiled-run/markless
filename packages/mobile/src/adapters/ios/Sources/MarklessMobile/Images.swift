#if canImport(UIKit)
import ImageIO
import MarklessCore
import UIKit

/// An image the app packaged for an `<img src>`: its bytes, or an SVG file's drawing, and its natural size in CSS px, read
/// when the app was built. An SVG file whose only size is its viewBox's ratio has no natural size.
public struct NativeImageAsset: Sendable {
	public let data: Data?
	public let drawing: NativeDrawing?
	public let width: Double?
	public let height: Double?

	public init(data: Data, width: Double, height: Double) {
		self.data = data
		self.drawing = nil
		self.width = width
		self.height = height
	}

	public init(drawing: NativeDrawing, width: Double?, height: Double?) {
		self.data = nil
		self.drawing = drawing
		self.width = width
		self.height = height
	}

	/// The app's packaged images, from `markless/images.json` and the files it names, in `bundle`.
	public static func bundled(in bundle: URL) -> [String: NativeImageAsset] {
		guard let manifest = try? Data(contentsOf: bundle.appending(path: "markless/images.json")),
		      case let .object(entries)? = try? JSONValue.parse(manifest) else { return [:] }
		var images: [String: NativeImageAsset] = [:]
		for (src, entry) in entries {
			guard case let .object(fields) = entry else { continue }
			let field = { (name: String) in fields.first(where: { $0.0 == name })?.1 }
			let number = { (name: String) -> Double? in if case let .number(n)? = field(name) { return n } else { return nil } }
			if let drawing = field("drawing") {
				guard let decoded = try? NativeDrawing.decode(drawing, at: "images.\(src).drawing") else { continue }
				images[src] = NativeImageAsset(drawing: decoded, width: number("width"), height: number("height"))
			} else if case let .string(file)? = field("file"), let width = number("width"), let height = number("height"),
			          let data = try? Data(contentsOf: bundle.appending(path: file)) {
				images[src] = NativeImageAsset(data: data, width: width, height: height)
			}
		}
		return images
	}
}

/// An `<img>`: the picture, at the web's size; when there is no picture to draw, its alt text, as the browser shows it.
final class ImageBox: UIView {
	let picture = UIImageView()
	private var drawn: DrawingView?
	private let alt = UILabel()
	private var size: [NSLayoutConstraint] = []
	/// The box takes the width it is given: a picture with a ratio and no size, as an SVG file with only a viewBox.
	private(set) var fillsWidth = false

	init() {
		super.init(frame: .zero)
		picture.contentMode = .scaleToFill
		alt.numberOfLines = 0
		for view in [picture, alt] {
			view.translatesAutoresizingMaskIntoConstraints = false
			addSubview(view)
			NSLayoutConstraint.activate([
				view.leadingAnchor.constraint(equalTo: leadingAnchor), view.trailingAnchor.constraint(equalTo: trailingAnchor),
				view.topAnchor.constraint(equalTo: topAnchor), view.bottomAnchor.constraint(equalTo: bottomAnchor),
			])
		}
		isAccessibilityElement = true
		accessibilityTraits = .image
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("ImageBox is made in code") }

	/// On a styled page, an img whose src the app sets as it runs: Dragon places the image it loads; nil otherwise.
	private(set) var loaded: LoadedImageView?

	/// Makes this box draw the images its app loads, as Dragon places them, instead of a picture at the web's size.
	func loadsImages() {
		guard loaded == nil else { return }
		let view = LoadedImageView()
		view.frame = bounds
		view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
		addSubview(view)
		loaded = view
		picture.isHidden = true
		alt.isHidden = true
	}

	/// `sized`: the stacking layout gives the box the image's size (its `width` and `height` attributes, else its natural
	/// size, keeping its ratio when only one is given), as the web's unstyled `<img>` takes. With only a ratio (an SVG file
	/// with only a viewBox) and no attributes, the stacking layout gives the box its width and the box keeps the ratio.
	func show(_ image: UIImage?, drawing: NativeDrawing?, natural: CGSize?, width: Double?, height: Double?, alt text: String?, sized: Bool) {
		picture.image = image
		drawn?.removeFromSuperview()
		drawn = drawing.map { DrawingView($0) }
		if let drawn {
			drawn.translatesAutoresizingMaskIntoConstraints = false
			addSubview(drawn)
			NSLayoutConstraint.activate([
				drawn.leadingAnchor.constraint(equalTo: leadingAnchor), drawn.trailingAnchor.constraint(equalTo: trailingAnchor),
				drawn.topAnchor.constraint(equalTo: topAnchor), drawn.bottomAnchor.constraint(equalTo: bottomAnchor),
			])
		}
		let shown = image != nil || drawing != nil
		alt.text = shown ? nil : text
		alt.isHidden = shown
		guard sized else { return }
		NSLayoutConstraint.deactivate(size)
		size = []
		fillsWidth = false
		var w = width.map { CGFloat($0) }
		var h = height.map { CGFloat($0) }
		let ratio = natural.flatMap { $0.width > 0 && $0.height > 0 ? $0.width / $0.height : nil }
			?? drawing?.viewBox.flatMap { $0[2] > 0 && $0[3] > 0 ? CGFloat($0[2] / $0[3]) : nil }
		if shown, let ratio {
			if w == nil, let h { w = h * ratio }
			if h == nil, let w { h = w / ratio }
			if let natural, natural.width > 0, natural.height > 0 {
				w = w ?? natural.width
				h = h ?? natural.height
			}
			if w == nil, h == nil {
				fillsWidth = true
				size.append(heightAnchor.constraint(equalTo: widthAnchor, multiplier: 1 / ratio))
			}
		}
		if let w { size.append(widthAnchor.constraint(equalToConstant: w)) }
		if let h { size.append(heightAnchor.constraint(equalToConstant: h)) }
		NSLayoutConstraint.activate(size)
	}

}
/// What an img whose src the app sets as it runs draws: nothing while its first image loads, the last image that loaded (kept while
/// the next one loads), or Chrome's no-image outline when it has no src or its image did not load.
enum LoadedImageState {
	case waiting
	case picture(LoadedPicture)
	case missing
}

/// A loaded image and its natural size in CSS px: a decoded bitmap (its pixel size), or an SVG file's drawing, rasterized where drawn.
enum LoadedPicture {
	case bitmap(CGImage)
	case drawing(NativeDrawing, width: Double, height: Double)

	var size: (width: Double, height: Double) {
		switch self {
		case let .bitmap(image): (Double(image.width), Double(image.height))
		case let .drawing(_, width, height): (width, height)
		}
	}

	/// The image at `src`: a file the app packaged, or a photo the device took (a `file:` URL); nil when there is none or it does not decode.
	static func load(_ src: String, packaged: [String: NativeImageAsset]) -> LoadedPicture? {
		if let asset = packaged[src] {
			if let drawing = asset.drawing {
				let box = drawing.viewBox ?? []
				// An SVG file with only a viewBox has a ratio and no size; its viewBox gives that ratio.
				guard let width = asset.width ?? (box.count == 4 ? box[2] : nil), let height = asset.height ?? (box.count == 4 ? box[3] : nil) else { return nil }
				return .drawing(drawing, width: width, height: height)
			}
			return asset.data.flatMap(decoded).map(LoadedPicture.bitmap)
		}
		guard let url = URL(string: src), url.isFileURL, let data = try? Data(contentsOf: url) else { return nil }
		return decoded(data).map(LoadedPicture.bitmap)
	}

	/// The bytes decoded into 8-bit sRGB with their EXIF orientation applied, as the browser draws them.
	private static func decoded(_ data: Data) -> CGImage? {
		guard let source = CGImageSourceCreateWithData(data as CFData, nil),
			let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
			let w = properties[kCGImagePropertyPixelWidth] as? Int, let h = properties[kCGImagePropertyPixelHeight] as? Int,
			let oriented = CGImageSourceCreateThumbnailAtIndex(source, 0, [
				kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
				kCGImageSourceThumbnailMaxPixelSize: max(w, h), kCGImageSourceShouldCacheImmediately: true,
			] as CFDictionary),
			let space = CGColorSpace(name: CGColorSpace.sRGB),
			let context = CGContext(
				data: nil, width: oriented.width, height: oriented.height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
				bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
		else { return nil }
		context.draw(oriented, in: CGRect(x: 0, y: 0, width: oriented.width, height: oriented.height))
		return context.makeImage()
	}
}

/// Draws an img's loaded image into the rect Dragon's paint gives for its size, clipped to the drawn part of the content box and its
/// rounded edge; with no image, the no-image outline.
final class LoadedImageView: UIView {
	private(set) var state = LoadedImageState.waiting
	/// The src last asked for: a load that finishes for another src is dropped.
	private var wanted: String?
	var style: (image: RuntimeImage, place: RuntimeImagePlace, scale: Double)? { didSet { setNeedsDisplay() } }
	/// The img's corner radius and border width in points, for the rounded edge of its content box.
	var edge: (radius: CGFloat, border: CGFloat) = (0, 0) { didSet { setNeedsDisplay() } }

	init() {
		super.init(frame: .zero)
		isOpaque = false
		backgroundColor = .clear
		isUserInteractionEnabled = false
		contentMode = .redraw
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("LoadedImageView is made in code") }

	/// The runtime's src for the img now; a new src loads off the main thread.
	func show(_ src: String?, packaged: [String: NativeImageAsset]) {
		guard src != wanted || src == nil else { return }
		wanted = src
		guard let src else { return move(to: .missing) }
		DispatchQueue.global(qos: .userInitiated).async {
			let picture = LoadedPicture.load(src, packaged: packaged)
			DispatchQueue.main.async { [weak self] in
				guard let self, self.wanted == src else { return }
				self.move(to: picture.map(LoadedImageState.picture) ?? .missing)
			}
		}
	}

	private func move(to next: LoadedImageState) {
		state = next
		setNeedsDisplay()
	}

	override func draw(_ rect: CGRect) {
		guard let style, let context = UIGraphicsGetCurrentContext() else { return }
		let s = style.scale
		let local = { (r: Frame) in
			CGRect(x: (r.x - style.place.originX) / s, y: (r.y - style.place.originY) / s, width: r.width / s, height: r.height / s)
		}
		switch state {
		case .waiting: return
		case .missing:
			let color = style.image.outline.map { (r: $0.r, g: $0.g, b: $0.b, alpha: $0.alpha) } ?? noImageOutline
			guard let paint = try? RuntimeImagePaint.paint(style.image, at: style.place, width: 0, height: 0, scale: s),
				paint.content.width > 2, paint.content.height > 2
			else { return }
			let c = paint.content
			context.setShouldAntialias(false)
			context.setFillColor(UIColor(red: color.r / 255, green: color.g / 255, blue: color.b / 255, alpha: color.alpha / 255).cgColor)
			for band in [
				Frame(x: c.x, y: c.y, width: c.width, height: 1), Frame(x: c.x, y: c.y + c.height - 1, width: c.width, height: 1),
				Frame(x: c.x, y: c.y + 1, width: 1, height: c.height - 2), Frame(x: c.x + c.width - 1, y: c.y + 1, width: 1, height: c.height - 2),
			] { context.fill(local(band)) }
		case let .picture(picture):
			let size = picture.size
			guard let paint = try? RuntimeImagePaint.paint(style.image, at: style.place, width: size.width, height: size.height, scale: s),
				let drawn = paint.drawn
			else { return }
			let dest = local(paint.dest)
			context.saveGState()
			context.clip(to: local(drawn))
			UIBezierPath(roundedRect: local(paint.content), cornerRadius: max(0, edge.radius - edge.border)).addClip()
			context.interpolationQuality = style.image.pixelated ? .none : .high
			switch picture {
			case let .bitmap(image): UIImage(cgImage: image).draw(in: dest)
			case let .drawing(drawing, _, _):
				let view = DrawingView(drawing)
				view.frame = CGRect(origin: .zero, size: dest.size)
				context.translateBy(x: dest.minX, y: dest.minY)
				view.draw(view.bounds)
			}
			context.restoreGState()
		}
	}
}

/// Blink's no-image outline colour, Color::kLightGray, for an img whose image did not load.
private let noImageOutline = (r: 192.0, g: 192.0, b: 192.0, alpha: 255.0)
#endif

