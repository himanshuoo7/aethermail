import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Forward,
  Inbox,
  Loader2,
  Mail,
  Menu,
  PenLine,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { fetchGmailMessages, sendGmailMessage } from "./services/gmailClient";
import { fetchOutlookMessages, sendOutlookMessage } from "./services/outlookClient";
import { getStoredAccounts, getValidAccount, removeStoredAccount, saveAccount } from "./services/tokenStore";
import { archiveMessage, composeMessage, deleteMessage, draftAiReply, filterMessages, getLabels } from "./services/mailEngine";
import { getAdapter } from "./services/providerAdapters";

const PROVIDER_LABEL = { gmail: "Gmail", office365: "Office 365", imap: "IMAP" };

const PROVIDERS = [
  { id: "gmail",     label: "Gmail",      color: "#d84939", oauth: true },
  { id: "office365", label: "Office 365", color: "#2563eb", oauth: true },
  {
    id: "yahoo", label: "Yahoo Mail", color: "#7c3aed", oauth: false,
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    hint: "Generate an App Password at account.yahoo.com → Security → App passwords.",
  },
  {
    id: "aol", label: "AOL Mail", color: "#e03d00", oauth: false,
    imap: { host: "imap.aol.com", port: 993, secure: true },
    smtp: { host: "smtp.aol.com", port: 465, secure: true },
    hint: "Generate an App Password at account.aol.com → Account security → App passwords.",
  },
];

async function fetchMessages(account) {
  const valid = await getValidAccount(account);
  if (valid.provider === "gmail") return { account: valid, messages: await fetchGmailMessages(valid) };
  if (valid.provider === "office365") return { account: valid, messages: await fetchOutlookMessages(valid) };
  throw new Error(`No client for provider: ${valid.provider}`);
}

export default function App() {
  const [mailAccounts, setMailAccounts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [activeAccount, setActiveAccount] = useState("all");
  const [query, setQuery] = useState("");
  const [activeLabel, setActiveLabel] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [composer, setComposer] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addFlow, setAddFlow] = useState(null);
  const emailRef = useRef(null);

  const labels = useMemo(() => getLabels(messages), [messages]);
  const visibleMessages = useMemo(
    () => filterMessages(messages, { accountId: activeAccount, query, label: activeLabel }),
    [activeAccount, query, activeLabel, messages],
  );
  const selected = messages.find((m) => m.id === selectedId) ?? visibleMessages[0] ?? null;
  const selectedAccount = mailAccounts.find((a) => a.id === selected?.accountId);
  const unreadCount = messages.filter((m) => m.folder === "inbox" && m.unread).length;
  const highPriority = messages.filter((m) => m.folder === "inbox" && (m.priority ?? 0) >= 85).length;

  // Load accounts from localStorage and sync on mount
  useEffect(() => {
    const stored = getStoredAccounts();
    if (!stored.length) {
      setSyncStatus("Click + to connect your Gmail or Outlook account.");
      return;
    }
    setMailAccounts(stored.map(({ accessToken: _a, refreshToken: _r, expiresAt: _e, ...meta }) => meta));
    syncAll(stored);
  }, []);

  // Listen for OAuth popup postMessage
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === "OAUTH_SUCCESS") {
        const account = event.data.account;
        saveAccount(account);
        const { accessToken: _a, refreshToken: _r, expiresAt: _e, ...meta } = account;
        setMailAccounts((prev) => {
          const without = prev.filter((a) => a.id !== meta.id);
          return [...without, meta];
        });
        closeAddFlow();
        setSyncStatus(`Fetching emails from ${meta.name}…`);
        fetchMessages(account).then(({ account: updated, messages: msgs }) => {
          saveAccount(updated);
          setMessages((prev) => {
            const ids = new Set(prev.filter((m) => m.accountId !== meta.id).map((m) => m.id));
            return [...prev.filter((m) => m.accountId !== meta.id), ...msgs.filter((m) => !ids.has(m.id))];
          });
          setSyncStatus(`Synced ${msgs.length} emails from ${meta.name}`);
          if (msgs[0]) setSelectedId(msgs[0].id);
        }).catch((err) => setSyncStatus(`Connected but sync failed: ${err.message}`));
      }
      if (event.data?.type === "OAUTH_ERROR") {
        setAddFlow((f) => f ? { ...f, step: "error", message: event.data.message } : f);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (addFlow?.step === "form" && emailRef.current) emailRef.current.focus();
  }, [addFlow?.step]);

  async function syncAll(accounts) {
    const list = accounts || getStoredAccounts();
    if (!list.length) return;
    setSyncing(true);
    setSyncStatus("Syncing…");
    let total = 0;
    for (const account of list) {
      try {
        const { account: updated, messages: msgs } = await fetchMessages(account);
        saveAccount(updated);
        setMessages((prev) => {
          const keep = prev.filter((m) => m.accountId !== account.id);
          return [...keep, ...msgs];
        });
        total += msgs.length;
      } catch (err) {
        if (err.message === "EXPIRED_TOKEN") {
          // Token refresh is handled inside getValidAccount — retry once
          setSyncStatus(`Re-authenticating ${account.name}…`);
        } else {
          setSyncStatus(`Sync error for ${account.name}: ${err.message}`);
        }
      }
    }
    setSyncing(false);
    if (total) setSyncStatus(`Synced ${total} emails`);
  }

  const openComposer = (mode, source) => {
    const accountId = activeAccount === "all" ? (selectedAccount?.id ?? mailAccounts[0]?.id) : activeAccount;
    setComposer(composeMessage({ mode, source, accountId }));
  };

  const sendEmail = async () => {
    if (!composer) return;
    const stored = getStoredAccounts();
    const account = stored.find((a) => a.id === composer.accountId);
    try {
      if (account?.provider === "gmail") {
        const valid = await getValidAccount(account);
        await sendGmailMessage({ accessToken: valid.accessToken, from: `${account.name} <${account.email}>`, to: composer.to, subject: composer.subject, body: composer.body });
      } else if (account?.provider === "office365") {
        const valid = await getValidAccount(account);
        await sendOutlookMessage({ accessToken: valid.accessToken, from: account.email, to: composer.to, subject: composer.subject, body: composer.body });
      }
      setSyncStatus("Message sent");
      setComposer(null);
    } catch (err) {
      setSyncStatus(`Send failed: ${err.message}`);
    }
  };

  const archiveSelected = () => {
    if (!selected) return;
    setMessages((cur) => archiveMessage(cur, selected.id));
    setSelectedId(visibleMessages.find((m) => m.id !== selected.id)?.id ?? null);
  };

  const deleteSelected = () => {
    if (!selected) return;
    setMessages((cur) => deleteMessage(cur, selected.id));
    setSelectedId(visibleMessages.find((m) => m.id !== selected.id)?.id ?? null);
  };

  const disconnectAccount = (id) => {
    removeStoredAccount(id);
    setMailAccounts((prev) => prev.filter((a) => a.id !== id));
    setMessages((prev) => prev.filter((m) => m.accountId !== id));
  };

  const startAddFlow = () => setAddFlow({ step: "select" });
  const closeAddFlow = () => setAddFlow(null);

  const openOAuthWindow = (providerKey) => {
    setAddFlow({ step: "connecting", provider: PROVIDERS.find((p) => p.id === providerKey) });
    const route = { gmail: "google", office365: "microsoft" }[providerKey] ?? providerKey;
    const popup = window.open(`/api/auth/${route}`, "oauth", "popup,width=520,height=660,left=200,top=100");
    if (!popup) setAddFlow((f) => ({ ...f, step: "error", message: "Popup was blocked — allow popups for this site and try again." }));
  };

  const pickProvider = (provider) => {
    if (provider.oauth) {
      openOAuthWindow(provider.id);
    } else {
      setAddFlow({ step: "form", provider, email: "", password: "" });
    }
  };

  const submitCredentials = async (e) => {
    e.preventDefault();
    if (addFlow?.step !== "form") return;
    const { provider, email, password } = addFlow;
    setAddFlow({ step: "connecting", provider, email, password });
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, label: provider.label, email, password, imap: provider.imap, smtp: provider.smtp }),
      });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error);
      saveAccount(meta);
      setMailAccounts((prev) => [...prev, meta]);
      closeAddFlow();
      setSyncStatus(`Connected ${meta.name}`);
    } catch (err) {
      setAddFlow((f) => ({ ...f, step: "error", message: err.message }));
    }
  };

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label="Accounts and labels">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><Mail size={22} /></div>
          <div><strong>AetherMail</strong><span>AI unified inbox</span></div>
        </div>

        <button className="primary-action" onClick={() => openComposer("new")} type="button">
          <PenLine size={18} /> Compose
        </button>

        <nav className="nav-section" aria-label="Mailboxes">
          <button className="nav-row active" type="button">
            <Inbox size={18} /> Unified inbox <span>{unreadCount}</span>
          </button>
          <button className="nav-row" type="button">
            <Sparkles size={18} /> Priority <span>{highPriority}</span>
          </button>
        </nav>

        <section className="nav-section">
          <div className="section-title-row">
            <span className="section-title">Accounts</span>
            <button className="add-account-btn" onClick={startAddFlow} type="button" aria-label="Add account">
              <Plus size={14} />
            </button>
          </div>
          <div className="accounts-list">
            <button className={activeAccount === "all" ? "account-row active" : "account-row"} onClick={() => setActiveAccount("all")} type="button">
              <span className="account-dot all" /> All accounts
            </button>
            {mailAccounts.map((account) => (
              <button
                className={activeAccount === account.id ? "account-row active" : "account-row"}
                key={account.id}
                onClick={() => setActiveAccount(account.id)}
                type="button"
              >
                <span className="account-dot" style={{ background: account.color }} />
                <span>{account.name}<small>{account.email}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="nav-section">
          <div className="section-title">Labels</div>
          <button className={activeLabel === "all" ? "label-row active" : "label-row"} onClick={() => setActiveLabel("all")} type="button">
            <Tag size={16} /> All labels
          </button>
          {labels.map((label) => (
            <button className={activeLabel === label ? "label-row active" : "label-row"} key={label} onClick={() => setActiveLabel(label)} type="button">
              <Tag size={16} /> {label}
            </button>
          ))}
        </section>
      </aside>

      <section className="inbox-pane" aria-label="Message list">
        <header className="mobile-topbar">
          <button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" type="button"><Menu size={20} /></button>
          <strong>AetherMail</strong>
          <button className="icon-button" onClick={() => openComposer("new")} aria-label="Compose" type="button"><PenLine size={20} /></button>
        </header>

        <div className="inbox-header">
          <div>
            <h1>Unified inbox</h1>
            <p>{visibleMessages.length} conversations sorted by AI priority</p>
          </div>
          <button className="sync-button" onClick={() => syncAll()} type="button" disabled={syncing}>
            {syncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} Sync
          </button>
        </div>

        {syncStatus && <p className="connection-status live">{syncStatus}</p>}

        <label className="search-field">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sender, subject, label, or content" />
        </label>

        {mailAccounts.length === 0 ? (
          <div className="empty-inbox-cta">
            <Mail size={36} />
            <h2>Connect your inbox</h2>
            <p>Sign in with Gmail or Outlook to see your emails here.</p>
            <button className="primary-action" onClick={startAddFlow} type="button">
              <Plus size={18} /> Add account
            </button>
          </div>
        ) : (
          <div className="message-list">
            {visibleMessages.map((message) => {
              const account = mailAccounts.find((a) => a.id === message.accountId);
              return (
                <button
                  className={selected?.id === message.id ? "message-card selected" : "message-card"}
                  key={message.id}
                  onClick={() => { setSelectedId(message.id); setSidebarOpen(false); }}
                  type="button"
                >
                  <span className="message-topline">
                    <strong>{message.from}</strong>
                    <small>{message.timestamp}</small>
                  </span>
                  <span className="message-subject">{message.subject}</span>
                  <span className="message-preview">{message.preview}</span>
                  <span className="message-meta">
                    <i style={{ background: account?.color ?? "#999" }} /> {account?.name ?? "Unknown"}
                    <b>{message.priority ?? "—"}</b>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="reader-pane" aria-label="Selected email">
        {selected ? (
          <>
            <header className="reader-header">
              <button className="back-button" onClick={() => setSelectedId(null)} type="button">
                <ChevronLeft size={18} /> Inbox
              </button>
              <div className="reader-actions">
                <button className="icon-button" onClick={() => openComposer("reply", selected)} aria-label="Reply" title="Reply" type="button"><Reply size={18} /></button>
                <button className="icon-button" onClick={() => openComposer("forward", selected)} aria-label="Forward" title="Forward" type="button"><Forward size={18} /></button>
                <button className="icon-button" onClick={archiveSelected} aria-label="Archive" title="Archive" type="button"><Archive size={18} /></button>
                <button className="icon-button danger" onClick={deleteSelected} aria-label="Delete" title="Delete" type="button"><Trash2 size={18} /></button>
              </div>
            </header>

            <article className="email-detail">
              {selectedAccount && (
                <div className="provider-strip">
                  <span style={{ background: selectedAccount.color }}>{PROVIDER_LABEL[selectedAccount.provider] ?? "Mail"}</span>
                  <small>{selectedAccount.email}</small>
                  <small>{getAdapter(selectedAccount.provider)?.sync ?? "OAuth sync"}</small>
                </div>
              )}
              <h2>{selected.subject}</h2>
              <div className="sender-line">
                <div><strong>{selected.from}</strong><span>{selected.fromEmail}</span></div>
                <time>{selected.timestamp}</time>
              </div>

              <section className="ai-panel" aria-label="AI assistant">
                <div className="ai-heading">
                  <Bot size={18} />
                  <strong>AI brief</strong>
                  <span className={(selected.priority ?? 0) >= 85 ? "priority high" : "priority"}>{selected.priority ?? "—"} priority</span>
                </div>
                <p>{selected.aiSummary ?? selected.preview}</p>
                <button className="secondary-action" onClick={() => setComposer({ ...composeMessage({ mode: "reply", source: selected }), body: draftAiReply(selected) })} type="button">
                  <Sparkles size={16} /> Draft reply
                </button>
              </section>

              <p className="message-body">{selected.body}</p>

              <div className="label-stack">
                {(selected.labels ?? []).map((label) => <span key={label}>{label}</span>)}
                {selected.starred && <Star size={16} fill="#ffb000" color="#ffb000" />}
              </div>
            </article>
          </>
        ) : (
          <div className="empty-state">
            <CheckCircle2 size={40} />
            <h2>{mailAccounts.length === 0 ? "No account connected" : "No email selected"}</h2>
          </div>
        )}
      </section>

      {composer && (
        <section className="composer" aria-label="Compose email">
          <header>
            <strong>Compose</strong>
            <button className="icon-button" onClick={() => setComposer(null)} aria-label="Close composer" type="button"><X size={18} /></button>
          </header>
          <select value={composer.accountId} onChange={(e) => setComposer({ ...composer, accountId: e.target.value })} aria-label="Sending account">
            {mailAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.email}</option>)}
          </select>
          <input value={composer.to} onChange={(e) => setComposer({ ...composer, to: e.target.value })} placeholder="To" aria-label="To" />
          <input value={composer.subject} onChange={(e) => setComposer({ ...composer, subject: e.target.value })} placeholder="Subject" aria-label="Subject" />
          <textarea value={composer.body} onChange={(e) => setComposer({ ...composer, body: e.target.value })} placeholder="Write your message…" aria-label="Message body" />
          <footer>
            <button className="secondary-action" onClick={() => selected && setComposer({ ...composer, body: draftAiReply(selected, "warm") })} type="button">
              <Sparkles size={16} /> Improve
            </button>
            <button className="primary-action compact" onClick={sendEmail} type="button">
              <Send size={16} /> Send
            </button>
          </footer>
        </section>
      )}

      {/* Add-account modal */}
      {addFlow && (
        <>
          <button className="modal-overlay" aria-label="Close" onClick={closeAddFlow} type="button" />
          <div className="add-account-sheet" role="dialog" aria-modal="true" aria-label="Add account">

            {addFlow.step === "select" && (
              <>
                <header className="sheet-header">
                  <strong>Add account</strong>
                  <button className="icon-button" onClick={closeAddFlow} aria-label="Close" type="button"><X size={18} /></button>
                </header>
                <p className="sheet-sub">Sign in to connect your mailbox</p>
                <div className="provider-list">
                  {PROVIDERS.map((p) => (
                    <button key={p.id} className="provider-row" onClick={() => pickProvider(p)} type="button">
                      <span className="provider-icon-sm" style={{ background: p.color }}><Mail size={16} color="#fff" /></span>
                      <span className="provider-row-label">{p.label}</span>
                      <span className="provider-row-action">{p.oauth ? "Sign in →" : "Enter credentials →"}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {(addFlow.step === "form" || addFlow.step === "error") && (
              <form onSubmit={submitCredentials}>
                <header className="sheet-header">
                  <div className="sheet-provider-heading">
                    <span className="provider-dot" style={{ background: addFlow.provider.color }} />
                    <strong>Sign in to {addFlow.provider.label}</strong>
                  </div>
                  <button className="icon-button" onClick={closeAddFlow} aria-label="Close" type="button"><X size={18} /></button>
                </header>
                <p className="sheet-hint">{addFlow.provider.hint}</p>
                {addFlow.step === "error" && <p className="sheet-error">{addFlow.message}</p>}
                <div className="sheet-fields">
                  <label className="sheet-label">Email
                    <input ref={emailRef} type="email" className="sheet-input" value={addFlow.email}
                      onChange={(e) => setAddFlow((f) => ({ ...f, email: e.target.value }))}
                      placeholder={`you@${addFlow.provider.id}.com`} required autoComplete="email" />
                  </label>
                  <label className="sheet-label">App password
                    <input type="password" className="sheet-input" value={addFlow.password}
                      onChange={(e) => setAddFlow((f) => ({ ...f, password: e.target.value }))}
                      placeholder="••••••••••••••••" required autoComplete="current-password" />
                  </label>
                </div>
                <div className="sheet-actions">
                  <button className="secondary-action" type="button" onClick={() => setAddFlow({ step: "select" })}>Back</button>
                  <button className="primary-action compact" type="submit">Connect</button>
                </div>
              </form>
            )}

            {addFlow.step === "connecting" && (
              <div className="sheet-connecting">
                <Loader2 size={32} className="spin" />
                <p>Signing in to {addFlow.provider?.label ?? "your account"}…</p>
                <small>Complete the sign-in in the popup window</small>
              </div>
            )}
          </div>
        </>
      )}

      {sidebarOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} type="button" />}
    </main>
  );
}
