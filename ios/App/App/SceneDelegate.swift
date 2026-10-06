import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Prefer storyboard-provided window when UISceneStoryboardFile is set;
        // otherwise create one with CAPBridgeViewController (Capacitor 8.5 template).
        if window == nil {
            window = UIWindow(windowScene: windowScene)
            window?.rootViewController = CAPBridgeViewController()
        }
        window?.backgroundColor = UIColor(red: 248.0 / 255.0, green: 250.0 / 255.0, blue: 252.0 / 255.0, alpha: 1)
        window?.makeKeyAndVisible()

        Capacitor.SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        Capacitor.SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        Capacitor.SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
