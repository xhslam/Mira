package app.inkstone.workspace

import android.view.HapticFeedbackConstants
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Native controls for the Android workspace. */
class InkstoneWorkspaceAccessModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InkstoneWorkspaceAccess")

    Function("performClickHaptic") {
      val activity = appContext.currentActivity ?: return@Function false
      activity.window.decorView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }

    AsyncFunction("setEditorInputEnabled") { viewId: Int, enabled: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction
      val editor = activity.findViewById<ViewGroup>(viewId) ?: return@AsyncFunction
      editor.descendantFocusability = if (enabled) {
        ViewGroup.FOCUS_BEFORE_DESCENDANTS
      } else {
        ViewGroup.FOCUS_BLOCK_DESCENDANTS
      }

      if (!enabled) {
        val focused = editor.findFocus() ?: return@AsyncFunction
        activity.getSystemService(InputMethodManager::class.java)
          ?.hideSoftInputFromWindow(focused.windowToken, 0)
        focused.clearFocus()
        // Android can keep the previous IME client when clearing leaves no
        // focused view. Give the window a non-editable target in that case.
        if (activity.currentFocus == null) {
          activity.window.decorView.apply {
            isFocusableInTouchMode = true
            requestFocus()
          }
        }
      }
    }.runOnQueue(Queues.MAIN)
  }
}
