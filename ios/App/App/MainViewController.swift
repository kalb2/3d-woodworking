import UIKit
import Capacitor

/// Bridge view controller that registers the app's local (in-target) plugins.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WallScanPlugin())
    }
}
