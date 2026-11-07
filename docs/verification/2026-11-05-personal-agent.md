# Mira Personal Agent 重构验证记录

**验证日期：** 2026-11-05（GMT+8）
**工作位置：** `/Users/apple/Desktop/Mira`
**版本边界：** 当前未提交工作区；保留用户已有改动。未创建 commit、未部署服务、未连接真实账号。

## 实现结果

- 主导航与全局侧栏为 Personal Agent → 学习 → 笔记 → 设置，默认 Agent。
- 画板页面、创建/编辑 runtime、Excalidraw/lz-string 专用依赖及字体打包分支已移除；遗留绘图仍可只读查看和原样分享，恢复草稿可重新查看并导出原文，不覆盖/删除用户文件。
- Agent 已接事项、草稿/确认委托、按需/前台查漏、来源覆盖/证据候选、结果、历史对话和 Provider/proposal。英语陪练迁入学习并保留保存/返回/练习跳转约束。
- 独立 Node 24 worker 及 App 的安全配对、显式快照同步、持久接收和幂等 ack 已实现；支持精确事项 scope、时区调度、租约恢复、有限重试及最近失败状态。未配置邮箱、消息、日历或系统推送。

## 最终自动化结果

| 检查                                                         | 结果                                         |
| ------------------------------------------------------------ | -------------------------------------------- |
| `npm test`                                                   | 137 个文件、785 项通过                       |
| `npm run typecheck`                                          | 通过；严格检查未降低                         |
| `npx tsc -p services/agent-worker/tsconfig.json`             | 通过                                         |
| `npm run lint`                                               | 通过                                         |
| `npm run format:check`                                       | 通过                                         |
| `git diff --check`                                           | 通过                                         |
| `npm run export:android -- --clear`                          | 通过；native HBC 与唯一 DOM HTML/JS/CSS 生成 |
| Node 24 原生加载 worker server 模块                          | 通过；未启动长驻服务                         |
| runtime/package/script 中 Excalidraw import/字体安装引用搜索 | 无残留                                       |

新增与保留的验证包括：事项/委托不可变与隔离、版本化读回/显式隔离恢复、未来版本保护、模型只读与原文证据、deferred 提取期间暂停/完成/取消、晚到授权拒绝、worker scope/认证/隔离/时区/DST/时钟回拨/有限重试、真实 loopback HTTP 配对与同步、接收失败不 ack、ack 响应丢失后的重启恢复和无重复执行、mocked Expo 文件/SecureStore 适配、旧绘图原样分享与恢复草稿安全，以及原有编辑器/数学/学习队列回归。

Mocked Expo 适配、源码/AST 布局守卫和历史截图哈希测试不代表已在设备渲染新界面，原有截图也不冒充此次重构后的新视觉基线。

## Android 导出产物

以下为忽略目录 `dist/` 中的 bundle，不是 APK，不代表已安装运行。导出封装已执行唯一 DOM 入口检查并安装/校验 20 个 KaTeX WOFF2 字体。该 export 模式不要求 source map；APK release 阶段原有 source map 校验仍保留。

| 路径                                                                      |    字节数 | SHA-256                                                            |
| ------------------------------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `dist/_expo/static/js/android/index-174ae22e6818c3195bccec0653c93277.hbc` | 6,225,537 | `7fe0a3aa2e7621cf01065f80e4e38f93a6284451fa0108b3583e65a5891629aa` |
| `dist/www.bundle/e1185d20a25a9c4c1d9b43ccc1f418b2.html`                   |     2,904 | `e124b2c7a199b6db756b55a9dd03157bf26e9b90a2f32f864cac6251e7d9f77d` |
| `dist/www.bundle/dd478fbebbc168968c49dd727ee009f7.js`                     | 7,631,580 | `ee15c740988eb354309a586b58163aa20675614282ad718fcc5a255deea0d262` |
| `dist/www.bundle/eaf983008c95548e74ed3a033f5d4536.css`                    |    24,382 | `14137f63e7a775816b3a9db915e8a9d193933d8fefd83adf39dcd412166a4eab` |

## 非阻塞警告

- Expo DOM CSS 处理报告 KaTeX 本地字体引用尚不支持；仓库导出封装继续将所需离线字体放入产物并校验成功，没有通过放宽 CSP、移除公式支持或忽略退出码规避验证。
- Node 原生导入报告根 package 未声明 module 类型而自动按 ES module 解析的性能警告；模块加载成功。本次未为消除该警告改变整个 Expo 项目的模块体系。

## 未执行或仍受条件限制

- 未构建/签名/安装本次 APK，未执行真机或模拟器 UI、键盘/IME/焦点、大字体、TalkBack 和系统分享验收。
- 未验证原生文件系统/SecureStore 的真实故障恢复、手机 HTTPS 网络或长期主机稳定性。
- 未配置或部署常驻 worker；没有真实 OAuth/邮箱/消息/日历/推送凭据，因此不声称实际邮件检查或通知送达。
- 无 worker 时仅前台补查，不能保证后台准点。远端以最近一次成功上传的快照为准；修改/暂停需要再次同步，App 关闭/卸载不会自动撤销独立服务。
- 未运行本次 iOS 导出或原生构建；iOS 脚本中的绘图资产路径已同步清理，但平台验收仍未完成。

架构与维护依据：[ADR-007](../adr/ADR-007-personal-agent-and-drawing-retirement.md)、[维护账本](../maintenance-history.md)、[发布前可靠性复盘](../incidents/INC-2026-11-05-agent-recovery-authority.md)、[发布清单](../release-checklist.md)。
