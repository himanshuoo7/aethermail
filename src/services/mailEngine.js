const normalize = (value) => value.toLowerCase().trim();

export function filterMessages(messages, { accountId = "all", query = "", label = "all", folder = "inbox" } = {}) {
  const q = normalize(query);
  return messages
    .filter((message) => accountId === "all" || message.accountId === accountId)
    .filter((message) => folder === "all" || message.folder === folder)
    .filter((message) => label === "all" || message.labels.includes(label))
    .filter((message) => {
      if (!q) return true;
      return [message.from, message.fromEmail, message.subject, message.preview, message.body, ...message.labels]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => b.priority - a.priority);
}

export function prioritizeMessages(messages) {
  return [...messages].sort((a, b) => b.priority - a.priority);
}

export function archiveMessage(messages, id) {
  return messages.map((message) => (message.id === id ? { ...message, folder: "archive", unread: false } : message));
}

export function deleteMessage(messages, id) {
  return messages.map((message) => (message.id === id ? { ...message, folder: "trash", unread: false } : message));
}

export function composeMessage({ mode = "new", source, accountId, to = "", subject = "", body = "" }) {
  if (mode === "reply" && source) {
    return {
      accountId: source.accountId,
      to: source.fromEmail,
      subject: source.subject.startsWith("Re:") ? source.subject : `Re: ${source.subject}`,
      body: `\n\nOn ${source.timestamp}, ${source.from} wrote:\n> ${source.body}`,
    };
  }

  if (mode === "forward" && source) {
    return {
      accountId: source.accountId,
      to: "",
      subject: source.subject.startsWith("Fwd:") ? source.subject : `Fwd: ${source.subject}`,
      body: `\n\nForwarded message:\nFrom: ${source.from} <${source.fromEmail}>\nSubject: ${source.subject}\n\n${source.body}`,
    };
  }

  return { accountId, to, subject, body };
}

export function draftAiReply(message, tone = "direct") {
  const prefix = tone === "warm" ? "Thanks for the note. " : "";
  return `${prefix}${message.suggestedReply}`;
}

export function getLabels(messages) {
  return Array.from(new Set(messages.flatMap((message) => message.labels))).sort();
}
