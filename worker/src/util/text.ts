// Colour codes and redrawn progress lines. Neither survives a trip through a <pre> in a browser,
// and both make a stored log unreadable in `less`. A Minecraft server's output is as full of them
// as Gradle's is.
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;

export function plain(text: string): string {
  return text.replace(ANSI, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
