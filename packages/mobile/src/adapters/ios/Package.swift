// swift-tools-version: 6.0
import PackageDescription

let package = Package(
	name: "MarklessMobile",
	platforms: [.iOS(.v18), .macOS(.v15)],
	products: [
		.library(name: "MarklessMobile", targets: ["MarklessMobile"]),
		.library(name: "MarklessCore", targets: ["MarklessCore"]),
	],
	targets: [
		.target(name: "MarklessCore"),
		.target(name: "MarklessMobile", dependencies: ["MarklessCore"]),
		.testTarget(name: "MarklessCoreTests", dependencies: ["MarklessCore"]),
	]
)
