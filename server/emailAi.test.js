import { describe, expect, it } from "vitest";
import { scorePriority, summarizeMessage, suggestReply } from "./emailAi";

describe("emailAi", () => {
  it("summarizes message text into a concise brief", () => {
    expect(summarizeMessage({ text: "Please confirm the invoice today. The deadline is close." })).toBe("Please confirm the invoice today.");
  });

  it("raises priority for unread urgent email", () => {
    const score = scorePriority({ subject: "Urgent password deadline", text: "Please reply today", flags: [] });
    expect(score).toBeGreaterThan(80);
  });

  it("suggests a safe password-related reply", () => {
    expect(suggestReply({ subject: "App password expires" })).toContain("app password");
  });
});
