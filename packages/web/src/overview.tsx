import { api, call, type OperatorOverview } from "@omagari/contract";
import { useEffect, useState } from "react";
import { server } from "./api.ts";
import { t } from "./i18n.ts";

/** Settings → Server → Overview (#445): counts from what the server already keeps, for operators. Nothing is tracked for it. */
export function OverviewPage({
  session,
  check,
}: {
  session: string;
  check: (error: unknown) => void;
}) {
  const [data, setData] = useState<OperatorOverview | "error">();
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the page opens
  useEffect(() => {
    call(server(session), api.operatorOverview)
      .then(setData)
      .catch((error) => {
        check(error);
        setData("error");
      });
  }, []);
  const words = t.settings.overview;
  if (data === undefined) return <div className="settings-group settings-loading" aria-busy />;
  if (data === "error")
    return (
      <div className="empty">
        <h2>{t.settings.loadFailedTitle}</h2>
        <p>{t.settings.loadFailedBody}</p>
      </div>
    );
  const row = (label: string, total: number, last7: number | null, note?: string) => (
    <div key={label} className="settings-row">
      <span className="settings-text">
        <span>{label}</span>
        <small>{note ?? (last7 === null ? "" : words.last7(last7))}</small>
      </span>
      <strong>{total}</strong>
    </div>
  );
  const { requests, steps } = data;
  return (
    <>
      <div className="settings-section">
        <h3>{words.requests}</h3>
        <div className="settings-group">
          {row(
            words.requestsLine(requests.pending, requests.approved, requests.denied),
            requests.pending + requests.approved + requests.denied,
            requests.last7,
          )}
        </div>
      </div>
      <div className="settings-section">
        <h3>{words.steps}</h3>
        <div className="settings-group">
          {row(words.signedIn, steps.signedIn.total, steps.signedIn.last7)}
          {row(words.runner, steps.runner.total, steps.runner.last7)}
          {row(words.shared, steps.shared.total, steps.shared.last7)}
          {row(words.work, steps.work.total, steps.work.last7)}
        </div>
      </div>
      <div className="settings-section">
        <h3>{words.totals}</h3>
        <div className="settings-group">
          {row(words.workspaces, data.workspaces.total, data.workspaces.last7)}
          {row(words.repos, data.repos.total, data.repos.last7)}
        </div>
      </div>
      <p className="help">{words.note}</p>
    </>
  );
}
