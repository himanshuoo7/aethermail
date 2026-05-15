import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: false, account: null }),
    });
  });

  it("renders the unified inbox and AI brief", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /unified inbox/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/ai assistant/i)).toHaveTextContent(/same-day sign-off/i);
    expect(await screen.findByText(/using mock inbox/i)).toBeInTheDocument();
  });

  it("searches across email content", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/search sender/i), "app password");
    expect(screen.getByText(/IMAP app password expires soon/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Launch sign-off/i })).not.toBeInTheDocument();
  });

  it("opens a populated AI reply composer", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /draft reply/i }));
    expect(screen.getByLabelText(/to/i)).toHaveValue("maya@northstar.co");
    expect(screen.getByLabelText(/message body/i).value).toContain("mobile inbox");
  });

  it("does not crash when a synced message has missing account metadata", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          configured: true,
          account: {
            id: "real-imap",
            provider: "imap",
            name: "Real IMAP",
            email: "real@example.com",
            color: "#0f766e",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          account: {
            id: "real-imap",
            provider: "imap",
            name: "Real IMAP",
            email: "real@example.com",
            color: "#0f766e",
          },
          messages: [
            {
              id: "orphan:1",
              uid: 1,
              accountId: "missing-account",
              from: "Sender",
              fromEmail: "sender@example.com",
              subject: "Real mailbox message",
              preview: "Preview",
              body: "Body",
              timestamp: "Today",
              labels: [],
              folder: "inbox",
              unread: true,
              starred: false,
              priority: 70,
              aiSummary: "Summary",
              suggestedReply: "Reply",
            },
          ],
        }),
      });

    render(<App />);
    await user.click(screen.getByRole("button", { name: /^sync$/i }));

    expect(await screen.findByRole("heading", { name: /real mailbox message/i })).toBeInTheDocument();
    expect(screen.getAllByText(/real@example.com/i).length).toBeGreaterThan(0);
  });
});
