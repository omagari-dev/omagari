import { EXECUTOR_NAMES, type ExecutorId } from "@omagari/contract";
import { Check, Copy, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { clearDemoNote, clearLimit, useDemoNote, useLimit } from "./api.ts";
import { t } from "./i18n.ts";
import { INSTALL_COMMAND } from "./install.ts";

const DOCS = "https://omagari.org";
const TROUBLESHOOTING = `${DOCS}/setup#troubleshooting`;
const DISCUSSIONS = "https://github.com/omagari-dev/omagari/discussions";
/** The landing page's "What leaves your computer" section (#429). */
const WHAT_GOES = `${DOCS}/#what-leaves-your-computer`;

/** A copy button. Says "Copied" for 2 seconds. */
function CopyButton({ text, label, name }: { text: string; label: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {} // Even if copying is blocked, the text is on screen
  };
  return (
    <button
      type="button"
      className="button outline"
      onClick={copy}
      aria-label={`${label}: ${name}`}
    >
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? t.connect.copied : label}
    </button>
  );
}

/** One command in a code block with its own copy button. */
function Command({ label, command }: { label: string; command: string }) {
  return (
    <div className="connect-row">
      <span className="connect-label">{label}</span>
      <div className="connect-command">
        <pre>
          <code>{command}</code>
        </pre>
        <CopyButton text={command} label={t.connect.copy} name={command} />
      </div>
    </div>
  );
}

const STEPS = ["login", "connect", "share", "work"] as const;
type Step = (typeof STEPS)[number];

/** What the server already knows about this member, which checks off each step (#433). Nothing here tracks clicks. */
export type Guide = {
  /** My runner has connected to this server once (`api.me` `connected`). */
  connected: boolean;
  /** I've shared at least one repo. */
  shared: boolean;
  /** One of my works has a status line in the member list. */
  working: boolean;
  /** The executors my runner reported. */
  executors: ExecutorId[];
};

/** How many steps are done, and the first one that isn't. Logging in is always done by the time anyone sees this. A step counts only once the ones before it do, so the list never skips. */
export function progressOf(guide: Guide) {
  const connect = guide.connected;
  const share = connect && guide.shared;
  const done: Record<Step, boolean> = { login: true, connect, share, work: share && guide.working };
  return {
    done,
    count: STEPS.filter((step) => done[step]).length,
    next: STEPS.find((s) => !done[s]),
  };
}

function Bar({ count }: { count: number }) {
  return (
    <span className="guide-bar">
      <i style={{ width: `${(count / STEPS.length) * 100}%` }} />
    </span>
  );
}

function Connected({ guide }: { guide: Guide }) {
  return (
    <p className="guide-ok" role="status">
      <Check size={16} aria-hidden />
      {t.connect.connected(guide.executors.map((executor) => EXECUTOR_NAMES[executor]).join(", "))}
    </p>
  );
}

/** What to do for one step. */
function StepBody({ step, address, phone }: { step: Step; address: string; phone: boolean }) {
  if (step === "connect" && phone)
    return (
      <>
        <p>{t.connect.phoneBody(new URL(address).host)}</p>
        <CopyButton text={address} label={t.connect.copyAddress} name={address} />
      </>
    );
  if (step === "connect")
    return (
      <>
        <p>{t.connect.connectBody}</p>
        <Command label={t.connect.install} command={INSTALL_COMMAND} />
        <Command label={t.connect.setup} command={`omagari setup ${address}`} />
        <p className="connect-note">
          {t.connect.setupDoes} {t.connect.remove} <code>omagari uninstall</code>
        </p>
        <p className="connect-note">{t.connect.pasteToAgent}</p>
        <p className="connect-note">{t.connect.codex}</p>
        <details className="guide-fold">
          <summary>{t.connect.stuck}</summary>
          <ul>
            {t.connect.errors.map((error) => (
              <li key={error.code}>
                <code>{error.code}</code> {error.fix}
              </li>
            ))}
            <li>
              {t.connect.ask}{" "}
              <a href={DISCUSSIONS} target="_blank" rel="noreferrer">
                {t.connect.askLink}
              </a>
            </li>
            <li>
              {t.connect.more}{" "}
              <a href={TROUBLESHOOTING} target="_blank" rel="noreferrer">
                {t.connect.troubleshooting}
              </a>
            </li>
          </ul>
        </details>
      </>
    );
  if (step === "share")
    return (
      <p>
        {t.connect.shareBody} <code>omagari share on</code>{" "}
        <a href={WHAT_GOES} target="_blank" rel="noreferrer">
          {t.connect.whatGoes}
        </a>
      </p>
    );
  if (step === "work") return <p>{t.connect.workBody}</p>;
  return null;
}

/**
 * "Getting started" above the conversation (#433, board 122-AB): the four steps, each checked off from what the server knows,
 * inviting teammates, and what it looks like when it works. On a phone the connect step says to do it on a computer (board 123).
 */
export function GettingStarted({
  address,
  guide,
  phone,
  onHide,
}: {
  address: string;
  guide: Guide;
  phone: boolean;
  onHide: () => void;
}) {
  const { done, count, next } = progressOf(guide);
  return (
    <section className="connect guide" aria-label={t.connect.title}>
      <div className="guide-head">
        <h2>{t.connect.title}</h2>
        <span className="guide-count">{t.connect.progress(count, STEPS.length)}</span>
        <button type="button" className="guide-link" onClick={onHide}>
          {t.connect.hide}
        </button>
      </div>
      {!phone && <p>{t.connect.needs}</p>}
      <ol className="guide-steps">
        {STEPS.map((step, index) => (
          <li key={step} className="guide-step">
            <span
              className={
                done[step] ? "guide-dot done" : step === next ? "guide-dot now" : "guide-dot"
              }
              aria-hidden
            >
              {done[step] ? <Check size={12} strokeWidth={3} /> : index + 1}
            </span>
            <div className="guide-step-body">
              <strong>
                {step === "connect" && phone && !done[step]
                  ? t.connect.phoneTitle
                  : t.connect.steps[step]}
                {done[step] && <span className="sr-only"> ✓</span>}
              </strong>
              {step === "connect" && done[step] && <Connected guide={guide} />}
              {(step === next || (step === "work" && !done[step])) && (
                <StepBody step={step} address={address} phone={phone} />
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="guide-invite">
        <p>
          <strong>{t.connect.invite}</strong> {t.connect.inviteBody}
        </p>
        <CopyButton text={address} label={t.connect.copyAddress} name={address} />
      </div>
      <details className="guide-fold">
        <summary>{t.connect.example}</summary>
        <div className="guide-example">
          <div>
            <p>
              <strong>jun</strong> · feat/login
            </p>
            <span>{t.connect.exampleLine}</span>
          </div>
          <div>
            <strong>{t.connect.exampleConflict}</strong>
            <span>feat/login × fix/session · startSession</span>
          </div>
        </div>
      </details>
    </section>
  );
}

/** The short line that shows once when all four steps are done (board 121). */
export function AllSet({ address, onClose }: { address: string; onClose: () => void }) {
  return (
    <section className="connect guide guide-done" aria-label={t.connect.title} role="status">
      <span className="guide-dot done" aria-hidden>
        <Check size={12} strokeWidth={3} />
      </span>
      <p>
        <strong>{t.connect.allSet}</strong> {t.connect.allSetBody}
      </p>
      <CopyButton text={address} label={t.connect.copyAddress} name={address} />
      <button type="button" className="button quiet" onClick={onClose}>
        {t.connect.close}
      </button>
    </section>
  );
}

/** The small progress button at the bottom of the channel panel (board 122-AB). Pressing it opens `GuideDialog`. */
export function GuideButton({ guide, onOpen }: { guide: Guide; onOpen: () => void }) {
  const { count, next } = progressOf(guide);
  return (
    <button type="button" className="guide-button" aria-haspopup="dialog" onClick={onOpen}>
      <span className="guide-button-head">
        <strong>{t.connect.title}</strong>
        <span>{t.connect.progress(count, STEPS.length)}</span>
      </span>
      <Bar count={count} />
      {next && <span className="guide-button-next">{t.connect.next(t.connect.steps[next])}</span>}
    </button>
  );
}

/**
 * Opens only when the person presses `GuideButton`; nothing pops up by itself. Before connecting it welcomes them (Skip / Start);
 * after, it says "Connected" and the next step (Later / Got it).
 */
export function GuideDialog({
  address,
  guide,
  phone,
  onSkip,
  onClose,
}: {
  address: string;
  guide: Guide;
  phone: boolean;
  onSkip: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  const { count, next } = progressOf(guide);
  const head = (
    <>
      <div className="guide-head">
        <strong>{t.connect.title}</strong>
        <span className="guide-count">{t.connect.progress(count, STEPS.length)}</span>
      </div>
      <Bar count={count} />
    </>
  );
  let body: ReactNode;
  let actions: ReactNode;
  if (!guide.connected) {
    body = (
      <>
        <h2>{t.connect.welcome}</h2>
        <p className="dialog-lead">{t.connect.welcomeBody}</p>
        {head}
        <p className="guide-dialog-note">
          {t.connect.next(t.connect.steps.connect)} · {t.connect.connectHint}
        </p>
        <p className="guide-dialog-note">{t.connect.needs}</p>
      </>
    );
    actions = (
      <>
        <button type="button" className="button quiet" onClick={onSkip}>
          {t.connect.skip}
        </button>
        <button type="button" className="button primary" onClick={() => dialog.current?.close()}>
          {t.connect.start}
        </button>
      </>
    );
  } else {
    body = (
      <>
        <div className="guide-head">
          <h2>{t.connect.title}</h2>
          <span className="guide-count">{t.connect.progress(count, STEPS.length)}</span>
        </div>
        <Bar count={count} />
        <Connected guide={guide} />
        {next && (
          <>
            <h3>{t.connect.next(t.connect.steps[next])}</h3>
            <StepBody step={next} address={address} phone={phone} />
          </>
        )}
      </>
    );
    actions = (
      <>
        <button type="button" className="button quiet" onClick={() => dialog.current?.close()}>
          {t.connect.later}
        </button>
        <button type="button" className="button primary" onClick={() => dialog.current?.close()}>
          {t.connect.gotIt}
        </button>
      </>
    );
  }
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled by the dialog
    <dialog
      ref={dialog}
      className="dialog guide-dialog"
      aria-label={guide.connected ? t.connect.title : t.connect.welcome}
      onClose={onClose}
      onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
    >
      {body}
      <div className="dialog-actions">{actions}</div>
    </dialog>
  );
}

/** A repo this member hasn't shared: a short notice with a Share button (a banner action). */
export function ShareNotice({ onShare, failed }: { onShare: () => void; failed: boolean }) {
  return (
    <div
      className={failed ? "banner error connect-notice" : "banner info connect-notice"}
      role={failed ? "alert" : "status"}
    >
      {failed ? t.connect.shareFailed : t.connect.notShared}
      <button type="button" className="banner-action" onClick={onShare}>
        {t.connect.share}
      </button>
    </div>
  );
}

/** A limit the server said was hit (ADR-0052), named with its number. Stays until closed or the next hit replaces it. */
export function LimitNotice() {
  const limit = useLimit();
  if (!limit) return null;
  return (
    <div className="banner warning connect-notice" role="alert">
      {t.connect.limit[limit.name](limit.max)}
      <button
        type="button"
        className="reply-stop limit-close"
        aria-label={t.connect.closeLimit}
        title={t.connect.closeLimit}
        onClick={clearLimit}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

/**
 * The static demo's note (ADR-0058): always there, so a visitor knows nothing leaves the tab.
 * When something needs a real server or agent (asking an agent, merge runs, decision PRs, saving settings), it says so.
 */
export function DemoNotice() {
  const needsServer = useDemoNote();
  return (
    <div
      className={needsServer ? "banner warning connect-notice" : "banner info connect-notice"}
      role="status"
    >
      {needsServer ? t.connect.demoNeedsServer : t.connect.demo}
      <a className="banner-action" href="https://app.omagari.org">
        {t.connect.openApp}
      </a>
      {needsServer && (
        <button
          type="button"
          className="reply-stop limit-close"
          aria-label={t.connect.closeLimit}
          title={t.connect.closeLimit}
          onClick={clearDemoNote}
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
