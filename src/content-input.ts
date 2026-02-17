import { readFile } from "node:fs/promises";

export async function resolveContent(
  inline?: string,
  filePath?: string,
): Promise<string> {
  if (inline !== undefined && filePath !== undefined) {
    throw new Error(
      "Cannot specify both inline content and a file path. Use one or the other.",
    );
  }

  if (inline !== undefined) {
    return inline;
  }

  if (filePath !== undefined) {
    return readFile(filePath, "utf8");
  }

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  return "";
}
