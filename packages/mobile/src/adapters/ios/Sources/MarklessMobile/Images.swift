import UIKit

/// An image the app packaged for an `<img src>`: its bytes and its natural size in CSS px, read when the app was built.
public struct NativeImageAsset: Sendable {
	public let data: Data
	public let width: Double
	public let height: Double

	public init(data: Data, width: Double, height: Double) {
		self.data = data
		self.width = width
		self.height = height
	}

	/// The app's packaged images, from `markless/images.json` and the files it names, in `bundle`.
	public static func bundled(in bundle: URL) -> [String: NativeImageAsset] {
		guard let manifest = try? Data(contentsOf: bundle.appending(path: "markless/images.json")),
		      let entries = try? JSONSerialization.jsonObject(with: manifest) as? [String: [String: Any]] else { return [:] }
		var images: [String: NativeImageAsset] = [:]
		for (src, entry) in entries {
			guard let file = entry["file"] as? String, let width = entry["width"] as? Double, let height = entry["height"] as? Double,
			      let data = try? Data(contentsOf: bundle.appending(path: file)) else { continue }
			images[src] = NativeImageAsset(data: data, width: width, height: height)
		}
		return images
	}
}

/// An `<img>`: the picture, at the web's size; when there is no picture to draw, its alt text, as the browser shows it.
final class ImageBox: UIView {
	let picture = UIImageView()
	private let alt = UILabel()
	private var size: [NSLayoutConstraint] = []

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
	/// size, keeping its ratio when only one is given), as the web's unstyled `<img>` takes.
	func show(_ image: UIImage?, natural: CGSize?, width: Double?, height: Double?, alt text: String?, sized: Bool) {
		picture.image = image
		alt.text = image == nil ? text : nil
		alt.isHidden = image != nil
		guard sized else { return }
		NSLayoutConstraint.deactivate(size)
		size = []
		var w = width.map { CGFloat($0) }
		var h = height.map { CGFloat($0) }
		if let natural, natural.width > 0, natural.height > 0, image != nil {
			if w == nil, let h { w = h * natural.width / natural.height }
			if h == nil, let w { h = w * natural.height / natural.width }
			w = w ?? natural.width
			h = h ?? natural.height
		}
		if let w { size.append(widthAnchor.constraint(equalToConstant: w)) }
		if let h { size.append(heightAnchor.constraint(equalToConstant: h)) }
		NSLayoutConstraint.activate(size)
	}
}
