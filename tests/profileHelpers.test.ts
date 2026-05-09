import { describe, expect, it } from "vitest";
import {
  PROFILE_COLORS,
  createRandomProfileColor,
  findProfileByAccountMetadata,
  isTeamProfile,
  metadataToProfileFields,
  normalizePlanType
} from "../src/shared/profileHelpers";
import type { AccountMetadata, Profile } from "../src/shared/types";

describe("profile helpers", () => {
  it("normalizes common plan labels", () => {
    expect(normalizePlanType("FREE")).toBe("free");
    expect(normalizePlanType("ChatGPT Plus")).toBe("plus");
    expect(normalizePlanType("PRO plan")).toBe("pro");
    expect(normalizePlanType("Team workspace")).toBe("team");
    expect(normalizePlanType("Business")).toBe("business");
    expect(normalizePlanType("Enterprise")).toBe("enterprise");
    expect(normalizePlanType("Education workspace")).toBe("edu");
    expect(normalizePlanType("mystery")).toBe("unknown");
  });

  it("maps team metadata to workspace profile fields and personal fallback", () => {
    const team = metadataToProfileFields(createMetadata({
      planType: "team",
      planLabel: "TEAM",
      workspaceName: "helloword1"
    }));
    const personal = metadataToProfileFields(createMetadata({
      planType: "free",
      planLabel: "FREE",
      workspaceName: ""
    }));

    expect(team.type).toBe("workspace");
    expect(team.workspaceName).toBe("helloword1");
    expect(isTeamProfile({ ...team, id: "p1", color: "#176b5b", isDefaultPersonal: false, capturedAt: "", encryptedCookieSnapshotId: "s1" })).toBe(true);
    expect(personal.type).toBe("personal");
  });

  it("generates colors from the preset palette", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(PROFILE_COLORS).toContain(createRandomProfileColor() as typeof PROFILE_COLORS[number]);
    }
  });

  it("matches saved profiles by strong identity without duplicating the current account", () => {
    const profile = createProfile({
      email: "team@example.com",
      accountId: "acct_1",
      organizationId: "org_1",
      workspaceName: "helloword1"
    });
    const metadata = createMetadata({
      email: "team@example.com",
      accountId: "acct_1",
      organizationId: "org_1",
      workspaceName: "helloword1"
    });

    expect(findProfileByAccountMetadata([profile], metadata)?.id).toBe("profile_1");
  });

  it("uses a unique email match only when account identity is otherwise unavailable", () => {
    const personal = createProfile({ email: "solo@example.com" });
    const team = createProfile({ id: "profile_2", email: "same@example.com" });
    const workspace = createProfile({
      id: "profile_3",
      email: "same@example.com",
      workspaceName: "Team"
    });

    expect(
      findProfileByAccountMetadata(
        [personal],
        createMetadata({ email: "solo@example.com" })
      )?.id
    ).toBe("profile_1");
    expect(
      findProfileByAccountMetadata(
        [team, workspace],
        createMetadata({ email: "same@example.com" })
      )
    ).toBeUndefined();
  });
});

function createMetadata(overrides: Partial<AccountMetadata>): AccountMetadata {
  return {
    email: "user@example.com",
    displayName: "User",
    planType: "unknown",
    planLabel: "UNKNOWN",
    workspaceName: "",
    subscriptionExpiresAt: "",
    metadataDetectedAt: "2026-05-09T00:00:00.000Z",
    metadataSource: "session",
    ...overrides
  };
}

function createProfile(overrides: Partial<Profile>): Profile {
  return {
    id: "profile_1",
    email: "",
    color: "#176b5b",
    type: "personal",
    isDefaultPersonal: false,
    capturedAt: "2026-05-09T00:00:00.000Z",
    encryptedCookieSnapshotId: "snapshot_1",
    ...overrides
  };
}
