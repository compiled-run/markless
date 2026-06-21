import UIKit

@main
final class ArcadeNativeProofDemoApp: UIResponder, UIApplicationDelegate {
	var window: UIWindow?

	func application(
		_ application: UIApplication,
		didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil,
	) -> Bool {
		let appWindow = UIWindow(frame: UIScreen.main.bounds)
		appWindow.rootViewController = ArcadeNativeProofDemoViewController()
		appWindow.makeKeyAndVisible()
		self.window = appWindow
		return true
	}
}

@MainActor
private final class ArcadeNativeProofDemoViewController: UIViewController {
	private var runtime: ArcadeNativeRuntime?

	override func viewDidLoad() {
		super.viewDidLoad()
		view.backgroundColor = .systemBackground

		do {
			let artifact = try ArcadeNativeProofResources.loadArtifact(from: .main)
			let runtime = try ArcadeNativeRuntime(artifact: artifact)
			self.runtime = runtime

			let root = try runtime.mount()
			root.translatesAutoresizingMaskIntoConstraints = false
			view.addSubview(root)

			NSLayoutConstraint.activate([
				root.centerXAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerXAnchor),
				root.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
				root.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
				root.trailingAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
			])
		} catch {
			showFailure(error)
		}
	}

	private func showFailure(_ error: Error) {
		let label = UILabel()
		label.text = "Arcade native proof failed: \(error)"
		label.numberOfLines = 0
		label.textAlignment = .center
		label.translatesAutoresizingMaskIntoConstraints = false
		view.addSubview(label)

		NSLayoutConstraint.activate([
			label.centerXAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerXAnchor),
			label.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
			label.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
			label.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
		])
	}
}
