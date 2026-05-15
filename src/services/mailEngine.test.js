import { describe, expect, it } from "vitest";
import { archiveMessage, composeMessage, draftAiReply, filterMessages, getLabels } from "./mailEngine";

const sample = [
  {
    id: "1",
    accountId: "gmail",
    from: "Ada",
    fromEmail: "ada@example.com",
    subject: "OAuth refresh",
    preview: "Token work",
    body: "Refresh Gmail token",
    labels: ["Dev"],
    folder: "inbox",
    priority: 80,
    timestamp: "Today",
    suggestedReply: "I will handle the token refresh.",
  },
  {
    id: "2",
    accountId: "m365",
    from: "Grace",
    fromEmail: "grace@example.com",
    subject: "Finance close",
    preview: "Invoice",
    body: "Upload invoice",
    labels: ["Finance"],
    folder: "inbox",
    priority: 95,
    timestamp: "Today",
    suggestedReply: "The invoice will be uploaded today.",
  },
];

describe("mailEngine", () => {
  it("filters unified messages by account, label, and query", () => {
    expect(filterMessages(sample, { accountId: "gmail" })).toHaveLength(1);
    expect(filterMessages(sample, { label: "Finance" })[0].id).toBe("2");
    expect(filterMessages(sample, { query: "oauth" })[0].id).toBe("1");
  });

  it("sorts by AI priority by default", () => {
    expect(filterMessages(sample).map((message) => message.id)).toEqual(["2", "1"]);
  });

  it("archives without removing the message record", () => {
    expect(archiveMessage(sample, "1").find((message) => message.id === "1").folder).toBe("archive");
  });

  it("creates reply drafts from source metadata", () => {
    const reply = composeMessage({ mode: "reply", source: sample[0] });
    expect(reply.to).toBe("ada@example.com");
    expect(reply.subject).toBe("Re: OAuth refresh");
  });

  it("returns AI reply and unique labels", () => {
    expect(draftAiReply(sample[1])).toContain("invoice");
    expect(getLabels(sample)).toEqual(["Dev", "Finance"]);
  });
});
