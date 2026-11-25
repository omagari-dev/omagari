import { api, call, type MyReport, type ReportRow } from "@omagari/contract";
import { ExternalLink } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { server } from "./api.ts";
import { ago, t } from "./i18n.ts";
import { issueUrl } from "./issue-url.ts";

/**
 * Settings → Server → Error reports (ADR-0063): every row, last seen first, for operators. Never shows who sent one.
 * The switch refuses reports for the whole server. `source` is the server's source URL, where "Open as GitHub issue" opens.
 */
export function ErrorReportsPage({
  session,
  source,
  check,
}: {
  session: string;
  source?: string;
  check: (error: unknown) => void;
}) {
  const [data, setData] = useState<{ reports: ReportRow[]; off: boolean } | "error">();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameId = useId();
  const noteId = useId();
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the page opens
  useEffect(() => {
    call(server(session), api.errorReports)
      .then(setData)
      .catch((error) => {
        check(error);
        setData("error");
      });
  }, []);
  const act = async (run: () => Promise<Partial<{ reports: ReportRow[]; off: boolean }>>) => {
    setBusy(true);
    setFailed(false);
    try {
      const next = await run();
      setData((now) => (typeof now === "object" ? { ...now, ...next } : now));
    } catch (error) {
      check(error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const words = t.settings.reports;
  if (data === undefined) return <div className="settings-group settings-loading" aria-busy />;
  if (data === "error")
    return (
      <div className="empty">
        <h2>{t.settings.loadFailedTitle}</h2>
        <p>{t.settings.loadFailedBody}</p>
      </div>
    );
  return (
    <>
      <div className="settings-section">
        <div className="settings-group">
          <div className="settings-row">
            <span className="settings-text">
              <span id={nameId}>{words.take}</span>
              <small id={noteId}>{words.takeNote}</small>
            </span>
            <button
              type="button"
              role="switch"
              className="switch"
              aria-checked={!data.off}
              aria-labelledby={nameId}
              aria-describedby={noteId}
              disabled={busy}
              onClick={() =>
                void act(() => call(server(session), api.refuseReports, { off: !data.off }))
              }
            />
          </div>
        </div>
      </div>
      <div className="settings-section">
        {data.reports.length === 0 ? (
          <p className="help access-empty">{words.empty}</p>
        ) : (
          <div className="settings-group">
            {data.reports.map((report) => {
              const link = source && issueUrl(source, report);
              return (
                <div key={report.id} className="settings-row report-row">
                  <ReportText report={report}>
                    {report.names.length > 0 && <small>{words.by(report.names.join(", "))}</small>}
                  </ReportText>
                  <span className="access-actions">
                    {link && (
                      <a
                        className="button outline small"
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {words.open}
                        <ExternalLink size={13} aria-hidden />
                      </a>
                    )}
                    <button
                      type="button"
                      className="button quiet small"
                      disabled={busy}
                      onClick={() =>
                        void act(() => call(server(session), api.resolveReport, { id: report.id }))
                      }
                    >
                      {words.resolve}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {failed && (
          <p className="help error" role="alert">
            {words.failed}
          </p>
        )}
      </div>
      <p className="help">{words.note}</p>
    </>
  );
}

/** One report's text: the error, where it came from, how often, and its stack folded. */
function ReportText({ report, children }: { report: MyReport; children?: ReactNode }) {
  const words = t.settings.reports;
  return (
    <span className="settings-text">
      <span className="report-message">
        {report.name}: {report.message}
      </span>
      <small>
        {words.meta(
          words.pieces[report.piece],
          report.version,
          `${report.os} ${report.arch}`,
          report.where,
        )}
      </small>
      <small>{words.seen(report.count, ago(report.last))}</small>
      {children}
      {report.stack.length > 0 && (
        <details className="guide-fold">
          <summary>{words.stack}</summary>
          <pre className="verdict-output">{report.stack.join("\n")}</pre>
        </details>
      )}
    </span>
  );
}

/** "Error reports I sent" (#526): only mine, with my own count, and Delete takes my part out. */
export function MyReportsList({
  session,
  check,
}: {
  session: string;
  check: (error: unknown) => void;
}) {
  const [reports, setReports] = useState<MyReport[] | "error">();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the page opens
  useEffect(() => {
    call(server(session), api.myReports)
      .then((reply) => setReports(reply.reports))
      .catch((error) => {
        check(error);
        setReports("error");
      });
  }, []);
  const remove = async (id: number) => {
    setBusy(true);
    setFailed(false);
    try {
      setReports((await call(server(session), api.deleteMyReport, { id })).reports);
    } catch (error) {
      check(error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const words = t.settings.myReports;
  return (
    <div className="settings-section">
      <h3>{words.sent}</h3>
      {reports === undefined ? (
        <div className="settings-group settings-loading" aria-busy />
      ) : reports === "error" ? (
        <p className="help error">{t.settings.loadFailedBody}</p>
      ) : reports.length === 0 ? (
        <p className="help access-empty">{words.empty}</p>
      ) : (
        <div className="settings-group">
          {reports.map((report) => (
            <div key={report.id} className="settings-row report-row">
              <ReportText report={report} />
              <span className="access-actions">
                <button
                  type="button"
                  className="button quiet small"
                  disabled={busy}
                  onClick={() => void remove(report.id)}
                >
                  {words.delete}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {failed && (
        <p className="help error" role="alert">
          {t.settings.reports.failed}
        </p>
      )}
      <p>{words.sentNote}</p>
    </div>
  );
}
