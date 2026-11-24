import type { ReportRow } from "@omagari/contract";

/** GitHub cuts longer new-issue URLs, so stack lines drop from the end until it fits. */
const MAX_URL = 8000;

/**
 * "Open as GitHub issue" (ADR-0063): a new-issue page on the server's source repo (`settings.sourceUrl`, so a fork opens on its fork), filled from the masked report.
 * The report never has the sender's login, so the issue can't either. Undefined when the source isn't a GitHub repo.
 */
export function issueUrl(source: string, report: ReportRow): string | undefined {
  const repo = source.replace(/\/+$/, "").replace(/\.git$/, "");
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repo)) return undefined;
  const title = `${report.piece}: ${report.name}: ${report.message}`.slice(0, 120);
  const body = (stack: string[]) =>
    [
      `**Piece**: ${report.piece} ${report.version} (${report.kind})`,
      `**OS**: ${report.os} ${report.arch} · ${report.runtime}`,
      `**Where**: ${report.where}`,
      `**Seen**: ${report.count === 1 ? "once" : `${report.count} times`}, first ${report.first}, last ${report.last}`,
      "",
      "```",
      `${report.name}: ${report.message}`,
      ...stack,
      "```",
      "",
      "_From the server's error reports. It's masked and doesn't say who sent it._",
    ].join("\n");
  for (let lines = report.stack.length; ; lines--) {
    const url = `${repo}/issues/new?${new URLSearchParams({ title, body: body(report.stack.slice(0, lines)) })}`;
    if (url.length <= MAX_URL || lines === 0) return url;
  }
}
