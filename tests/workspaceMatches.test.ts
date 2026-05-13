import { describe, expect, it } from "vitest";
import {
  CHATGPT_TAB_PATTERNS,
  OPENAI_WORKSPACE_MATCH_PATTERNS,
  isOpenAiWorkspaceUrl
} from "../src/shared/constants";

describe("ChatGPT/OpenAI workspace matches", () => {
  it("uses one shared match list for tab queries", () => {
    expect(CHATGPT_TAB_PATTERNS).toBe(OPENAI_WORKSPACE_MATCH_PATTERNS);
  });

  it("accepts supported ChatGPT and OpenAI entry hosts", () => {
    expect(isOpenAiWorkspaceUrl("https://chatgpt.com/")).toBe(true);
    expect(isOpenAiWorkspaceUrl("https://chat.openai.com/")).toBe(true);
    expect(isOpenAiWorkspaceUrl("https://platform.openai.com/settings/organization")).toBe(
      true
    );
    expect(isOpenAiWorkspaceUrl("https://auth.openai.com/authorize")).toBe(true);
    expect(isOpenAiWorkspaceUrl("https://openai.com/")).toBe(true);
  });

  it("rejects lookalike or unsupported URLs", () => {
    expect(isOpenAiWorkspaceUrl("http://chatgpt.com/")).toBe(false);
    expect(isOpenAiWorkspaceUrl("https://evilchatgpt.com/")).toBe(false);
    expect(isOpenAiWorkspaceUrl("https://openai.com.example.test/")).toBe(false);
    expect(isOpenAiWorkspaceUrl("not a url")).toBe(false);
    expect(isOpenAiWorkspaceUrl(undefined)).toBe(false);
  });
});
