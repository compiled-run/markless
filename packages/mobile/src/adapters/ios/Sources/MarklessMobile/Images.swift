#if canImport(UIKit)
import MarklessCore
import UIKit

/// An image the app packaged for an `<img src>`: its bytes, or an SVG file's drawing, and its natural size in CSS px, read
/// when the app was built. An SVG file whose only size is its viewBox's ratio has no natural size.
public struct NativeImageAsset: Sendable {
	public let data: Data?
	public let drawing: NativeDrawing?
	public let width: Double?
	public let height: Double?
	/// A JPEG's EXIF orientation the build applied to its size, 2 to 8; without one the picture is drawn as stored.
	public let orientation: Int?

	public init(data: Data, width: Double, height: Double, orientation: Int? = nil) {
		self.data = data
		self.drawing = nil
		self.width = width
		self.height = height
		self.orientation = orientation
	}

	public init(drawing: NativeDrawing, width: Double?, height: Double?) {
		self.data = nil
		self.drawing = drawing
		self.width = width
		self.height = height
		self.orientation = nil
	}

	/// The picture, turned as the browser draws it: by the orientation the build read, and never by one the build left out
	/// (a WebP's EXIF orientation, which Chrome does not apply).
	var picture: UIImage? {
		guard let image = data.flatMap({ UIImage(data: $0) }) else { return nil }
		guard orientation == nil, image.imageOrientation != .up, let stored = image.cgImage else { return image }
		return UIImage(cgImage: stored, scale: image.scale, orientation: .up)
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
				images[src] = NativeImageAsset(data: data, width: width, height: height, orientation: number("orientation").map { Int($0) })
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
#endif
