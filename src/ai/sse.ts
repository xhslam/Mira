export async function* parseServerSentEvents(chunks: AsyncIterable<string>): AsyncIterable<string> {
  let buffer = "";
  let dataLines: string[] = [];

  function consumeLine(line: string): string | null {
    if (line === "") {
      if (dataLines.length === 0) return null;
      const event = dataLines.join("\n");
      dataLines = [];
      return event;
    }
    if (line.startsWith(":")) return null;
    if (line === "data") dataLines.push("");
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    return null;
  }

  for await (const chunk of chunks) {
    buffer += chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const event = consumeLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      if (event !== null) yield event;
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer) consumeLine(buffer);
  if (dataLines.length > 0) yield dataLines.join("\n");
}
