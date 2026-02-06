import { describe, expect, it } from "bun:test";
import { parsePageInput, resolvePageIdForSite } from "../src/confluence";

describe("confluence page input parsing", () => {
  it("accepts numeric page id", () => {
    const parsed = parsePageInput("22982787097");
    expect(parsed.pageId).toBe("22982787097");
    expect(parsed.hostFromUrl).toBeUndefined();
  });

  it("extracts id from pages path url", () => {
    const parsed = parsePageInput(
      "https://example.atlassian.net/wiki/spaces/ENG/pages/22982787097/My+Page",
    );

    expect(parsed.pageId).toBe("22982787097");
    expect(parsed.hostFromUrl).toBe("example.atlassian.net");
  });

  it("extracts id from pageId query parameter", () => {
    const parsed = parsePageInput(
      "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=22982787097",
    );

    expect(parsed.pageId).toBe("22982787097");
  });

  it("fails when url host mismatches config site", () => {
    expect(() =>
      resolvePageIdForSite(
        "https://other.atlassian.net/wiki/pages/viewpage.action?pageId=22982787097",
        "example.atlassian.net",
      ),
    ).toThrow("URL host mismatch");
  });

  it("fails when id cannot be extracted from url", () => {
    expect(() => parsePageInput("https://example.atlassian.net/wiki/spaces/ENG/overview")).toThrow(
      "Could not extract",
    );
  });
});
