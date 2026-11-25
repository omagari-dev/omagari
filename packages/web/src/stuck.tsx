import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { t, useLanguage } from "./i18n.ts";
import { Centered } from "./login.tsx";
import { reportError, watchStuck } from "./report.ts";

/** Under a short wait (ADR-0064): after a minute it says so, offers "Try again", and one stuck report goes. Pressing it doesn't start another clock. */
export function Stuck({ where, onRetry }: { where: string; onRetry: () => void }) {
  const [late, setLate] = useState(false);
  useEffect(() => watchStuck(where, () => setLate(true)), [where]);
  if (!late) return null;
  return (
    <>
      <p className="hint" role="status">
        {t.stuck}
      </p>
      <div className="actions">
        <button type="button" className="button outline" onClick={onRetry}>
          {t.tryAgain}
        </button>
      </div>
    </>
  );
}

/** A render error shows this screen instead of a blank page, and goes out as a report. */
export class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    reportError("render error", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Crashed />;
  }
}

function Crashed() {
  useLanguage(); // the boundary sits outside the app, so it redraws itself when the language changes
  return (
    <Centered>
      <h1>{t.crash.title}</h1>
      <p>{t.crash.body}</p>
      <div className="actions">
        <button type="button" className="button primary" onClick={() => location.reload()}>
          {t.crash.reload}
        </button>
      </div>
    </Centered>
  );
}
