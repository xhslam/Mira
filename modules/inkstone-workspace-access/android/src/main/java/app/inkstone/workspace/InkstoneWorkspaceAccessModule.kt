package app.inkstone.workspace

import android.view.HapticFeedbackConstants
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Permission-free click feedback through the current Activity's decor view. */
class InkstoneWorkspaceAccessModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InkstoneWorkspaceAccess")

    Function("performClickHaptic") {
      val activity = appContext.currentActivity ?: return@Function false
      activity.window.decorView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }
  }
}
