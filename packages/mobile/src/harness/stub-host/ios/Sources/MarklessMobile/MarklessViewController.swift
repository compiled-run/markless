import UIKit

// The iOS host's entry point with a hand-made screen behind it, so the harness is proven without the real host; its payload only names the button label per platform.
@MainActor
public final class MarklessViewController: UIViewController {
	private var taps = 0
	private let button = UIButton(type: .system)
	private let label: String

	public init(payload: Data, style: Data? = nil, fonts: [String: Data] = [:]) throws {
		let labels = (try JSONSerialization.jsonObject(with: payload) as? [String: Any])?["label"] as? [String: String]
		label = labels?["ios"] ?? "Tap"
		super.init(nibName: nil, bundle: nil)
	}

	required init?(coder: NSCoder) { nil }

	public override func viewDidLoad() {
		super.viewDidLoad()
		view.backgroundColor = .white
		let title = UILabel()
		title.text = "Harness"
		title.frame = CGRect(x: 24, y: 100, width: 300, height: 40)
		button.setTitle("\(label) 0", for: .normal)
		button.frame = CGRect(x: 24, y: 160, width: 200, height: 44)
		button.contentHorizontalAlignment = .leading
		button.addAction(UIAction { [weak self] _ in self?.tap() }, for: .touchUpInside)
		view.addSubview(title)
		view.addSubview(button)
	}

	private func tap() {
		taps += 1
		button.setTitle("\(label) \(taps)", for: .normal)
	}
}
