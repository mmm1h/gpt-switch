import { describe, expect, it } from "vitest";
import { getValidityView } from "../src/shared/dates";

describe("validity view", () => {
  it("shows remaining days for future expiry dates", () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    expect(getValidityView(future).label).toMatch(/^有效期 \d+天$/);
    expect(getValidityView(future).status).toBe("active");
  });

  it("shows expired and unknown states", () => {
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    expect(getValidityView(expired).status).toBe("expired");
    expect(getValidityView(expired).label).toBe("已过期");
    expect(getValidityView("").label).toBe("有效期未知");
    expect(getValidityView("not a date").status).toBe("unknown");
  });
});
