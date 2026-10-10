import { connect } from "node:net";
import { readFileSync } from "node:fs";
// Test-only private mailbox. Errors omit credentials; never import in app code.
export async function syntheticTokenFor(email: string) {
  try {
    const control = JSON.parse(readFileSync(".cache/m2-browser.json", "utf8")) as { port: number; key: string; databaseName: string };
    if (control.databaseName !== process.env.M2_BROWSER_DATABASE) throw new Error("Wrong target");
    const token = await new Promise<string | undefined>((accept, reject) => {
      const socket = connect(control.port, "127.0.0.1", () => socket.write(JSON.stringify({ key: control.key, email }) + "\n"));
      socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("Timeout")); });
      let data = "";
      socket.on("data", (chunk) => { data += chunk.toString(); });
      socket.on("end", () => {
        try { accept((JSON.parse(data) as { token?: string }).token); } catch { reject(new Error("Invalid response")); }
      });
      socket.on("error", () => reject(new Error("Unavailable")));
    });
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Unavailable");
    return token;
  } catch { throw new Error("Private synthetic mailbox unavailable; credentials omitted"); }
}
