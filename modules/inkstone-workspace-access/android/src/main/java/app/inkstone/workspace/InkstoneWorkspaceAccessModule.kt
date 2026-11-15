package app.inkstone.workspace

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.security.MessageDigest
import android.view.HapticFeedbackConstants
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Native controls for the Android workspace. */
class InkstoneWorkspaceAccessModule : Module() {
  @Suppress("DEPRECATION")
  private fun versionCode(info: PackageInfo): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode.toInt() else info.versionCode

  override fun definition() = ModuleDefinition {
    Name("InkstoneWorkspaceAccess")

    Function("androidBuildNumber") {
      val context = appContext.reactContext ?: error("Android context unavailable")
      versionCode(context.packageManager.getPackageInfo(context.packageName, 0))
    }

    Function("openAndroidInstallPermission") {
      val activity = appContext.currentActivity ?: error("Android activity unavailable")
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        activity.startActivity(Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:" + activity.packageName)
        ))
      }
    }

    AsyncFunction("installAndroidUpdate") { expectedDigest: String, expectedBuild: Int ->
      val activity = appContext.currentActivity ?: error("Android activity unavailable")
      val packages = activity.packageManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packages.canRequestPackageInstalls()) {
        return@AsyncFunction false
      }

      val apk = File(activity.cacheDir, "mira-update.apk")
      val digest = MessageDigest.getInstance("SHA-256")
      apk.inputStream().buffered().use { stream ->
        val buffer = ByteArray(64 * 1024)
        var count = stream.read(buffer)
        while (count != -1) {
          digest.update(buffer, 0, count)
          count = stream.read(buffer)
        }
      }
      check(digest.digest().joinToString("") { "%02x".format(it) } == expectedDigest) {
        "安装包校验失败，请重新检查更新。"
      }

      // Android enforces signer continuity again when it installs the update.
      @Suppress("DEPRECATION")
      val flags = PackageManager.GET_SIGNATURES
      val installed = packages.getPackageInfo(activity.packageName, flags)
      val candidate = packages.getPackageArchiveInfo(apk.absolutePath, flags)
      check(candidate != null && candidate.packageName == activity.packageName &&
        versionCode(candidate) == expectedBuild && expectedBuild > versionCode(installed)) {
        "安装包的应用或版本不匹配。"
      }
      @Suppress("DEPRECATION")
      val matchesSigner = candidate.signatures?.toSet()?.let { it.isNotEmpty() && it == installed.signatures?.toSet() }
      check(matchesSigner == true) { "当前安装的 mira 与新版签名不同，无法覆盖更新。" }

      val uri = FileProvider.getUriForFile(activity, activity.packageName + ".FileSystemFileProvider", apk)
      activity.startActivity(Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      })
      true
    }

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
