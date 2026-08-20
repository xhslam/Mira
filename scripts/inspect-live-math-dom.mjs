const target = JSON.parse(await (await fetch("http://127.0.0.1:9222/json")).text())[0];
if (!target?.webSocketDebuggerUrl) throw new Error("No WebView debug target found.");
const socket = new WebSocket(target.webSocketDebuggerUrl);
const expression = `JSON.stringify({
  ready: document.readyState,
  mode: document.querySelector('.kernel-shell')?.className ?? null,
  text: document.querySelector('.tiptap-editor')?.innerText ?? null,
  formulas: [...document.querySelectorAll('.math-node')].map((node) => ({
    kind: node.className,
    error: node.dataset.mathError ?? null,
    errorCode: node.dataset.mathErrorCode ?? null,
    aria: node.getAttribute('aria-label'),
    hasKatex: Boolean(node.querySelector('.katex')),
    hasDisplay: Boolean(node.querySelector('.katex-display')),
    overflowX: getComputedStyle(node).overflowX,
    text: node.textContent,
  })),
})`;
const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("CDP evaluation timed out.")), 5000);
  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true },
      }),
    );
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === 1) {
      clearTimeout(timer);
      socket.close();
      resolve(message.result.result.value);
    }
  });
  socket.addEventListener("error", (event) => reject(event));
});
console.log(JSON.stringify(JSON.parse(result), null, 2));
