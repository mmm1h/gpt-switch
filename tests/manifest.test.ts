import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OPENAI_WORKSPACE_MATCH_PATTERNS } from "../src/shared/constants";

describe("manifest", () => {
  it("declares extension and action icons that exist on disk", () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve("public", "manifest.json"), "utf8")
    ) as {
      icons: Record<string, string>;
      action: { default_icon: Record<string, string> };
    };

    expect(manifest.icons).toEqual({
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    });
    expect(manifest.action.default_icon).toEqual(manifest.icons);

    for (const [size, iconPath] of Object.entries(manifest.icons)) {
      const fullPath = path.resolve("public", iconPath);
      const png = readFileSync(fullPath);

      expect(statSync(fullPath).isFile()).toBe(true);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBe(Number(size));
      expect(png.readUInt32BE(20)).toBe(Number(size));
    }
  });

  it("uses the same ChatGPT/OpenAI workspace matches everywhere", () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve("public", "manifest.json"), "utf8")
    ) as {
      host_permissions: string[];
      content_scripts: Array<{ matches: string[] }>;
      web_accessible_resources: Array<{ matches: string[] }>;
    };

    expect(manifest.host_permissions).toEqual(OPENAI_WORKSPACE_MATCH_PATTERNS);
    expect(manifest.content_scripts[0]?.matches).toEqual(
      OPENAI_WORKSPACE_MATCH_PATTERNS
    );
    expect(manifest.web_accessible_resources[0]?.matches).toEqual(
      OPENAI_WORKSPACE_MATCH_PATTERNS
    );
  });
});
