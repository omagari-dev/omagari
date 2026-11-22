import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./app.css";
import { api, call } from "@omagari/contract";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Access } from "./access.tsx";
import { followLinks, format, go, here, parse, usePath, workspaceOf } from "./address.ts";
import {
  lastPath,
  type Me,
  placeKey,
  remember,
  remembered,
  type Workspace as Space,
  savedSession,
  saveSession,
  server,
  setWorkspace,
  signedOut,
} from "./api.ts";
import { setLanguage, t, useLanguage } from "./i18n.ts";
import { Centered, Login } from "./login.tsx";
import { setAppearance } from "./theme.ts";
import { Tooltip } from "./tooltip.tsx";
import { Workspace } from "./workspace.tsx";

/** The workspace last picked on this device. */
const WORKSPACE_KEY = "omagari.workspace";

/** The address to come back to after signing in (ADR-0057). */
let returnTo: string | undefined;

/**
 * The path for an address once signed in: an old `#…` link gets its workspace from its channel (`workspaces`, the likely one first),
 * and `/login` and unknown addresses go to `/`.
 */
async function settle(address: string, session: string, workspaces: string[]) {
  const at = parse(address);
  if (typeof at !== "object" || !(at.workspace || at.channel)) return "/";
  const workspace =
    at.workspace ??
    (await workspaceOf(at.channel ?? "", workspaces, (id) =>
      call({ ...server(session), workspace: id }, api.channels).then(
        (list) => list.channels,
        () => [],
      ),
    ));
  return format({ ...at, workspace });
}

type State =
  | { kind: "checking" }
  | { kind: "out"; notice?: string }
  | { kind: "unreachable"; session: string }
  | { kind: "in"; session: string; me: Me; workspaces: Space[]; workspace: string };

function App() {
  const [state, setState] = useState<State>(() =>
    savedSession() ? { kind: "checking" } : { kind: "out" },
  );
  useLanguage(); // redraws every screen when the language changes
  const path = usePath();

  /** The session ended. Go back to login and say so. */
  const expire = useCallback(() => {
    saveSession(undefined);
    setLanguage("en"); // before login it's always English (ADR-0045)
    setAppearance("system");
    setState({ kind: "out", notice: t.login.expired });
  }, []);

  /** Load me from the session. If the session ended, go to login; if the server can't be reached, keep the session and show Try again. */
  const enter = useCallback(
    async (session: string) => {
      try {
        const [me, { workspaces }] = await Promise.all([
          call(server(session), api.me),
          call(server(session), api.workspaces),
        ]);
        // No workspace left (the last one was deleted): back to the sign-in screen.
        if (!workspaces.length) {
          saveSession(undefined);
          return setState({ kind: "out" });
        }
        saveSession(session);
        // Enter the workspace seen last time (if it's gone, the first one), unless the address is in another one.
        const saved = remembered(WORKSPACE_KEY);
        const workspace =
          workspaces.find((space) => space.id === saved)?.id ?? workspaces[0]?.id ?? "";
        const back = returnTo ?? here();
        returnTo = undefined;
        const others = workspaces.map((space) => space.id).filter((id) => id !== workspace);
        const target = await settle(back, session, [workspace, ...others]);
        setWorkspace(workspace);
        setLanguage(me.prefs.language);
        setAppearance(me.prefs.appearance);
        // In the same tick as the state, so the signed-out redirect never sees the new path.
        go(target, true);
        setState({ kind: "in", session, me, workspaces, workspace });
      } catch (error) {
        if (!signedOut(error)) return setState({ kind: "unreachable", session });
        expire();
      }
    },
    [expire],
  );

  useEffect(() => {
    const session = savedSession();
    if (session) void enter(session);
  }, [enter]);

  // Signed out, every address goes to /login, and signing in comes back to it (ADR-0057).
  useEffect(() => {
    if (state.kind !== "out" || path === "/login") return;
    returnTo = path;
    go("/login", true);
  }, [state.kind, path]);

  // Signed in, an old `#…` link, /login, or an unknown address is replaced by its path.
  useEffect(() => {
    if (state.kind !== "in") return;
    const at = parse(path);
    if (typeof at === "object" && (at.workspace || !at.channel)) return;
    let stale = false;
    const others = state.workspaces.map((space) => space.id).filter((id) => id !== state.workspace);
    void settle(path, state.session, [state.workspace, ...others]).then(
      (to) => !stale && go(to, true),
    );
    return () => {
      stale = true;
    };
  }, [state, path]);

  /** The workspace in the address, if I'm in it. An address in another workspace switches to it. */
  const at = parse(path);
  const addressed =
    state.kind === "in" &&
    typeof at === "object" &&
    state.workspaces.some((space) => space.id === at.workspace)
      ? at.workspace
      : undefined;
  useEffect(() => {
    if (state.kind !== "in" || !addressed || addressed === state.workspace) return;
    remember(WORKSPACE_KEY, addressed);
    setState({ ...state, workspace: addressed });
  }, [state, addressed]);

  if (state.kind === "checking") return <main className="centered" aria-busy="true" />;
  if (state.kind === "out") return <Login notice={state.notice} onSession={enter} />;
  if (state.kind === "unreachable") {
    return (
      <Centered>
        <h1>{t.login.unreachableTitle}</h1>
        <p>{t.login.unreachableBody}</p>
        <div className="actions">
          <button type="button" className="button outline" onClick={() => enter(state.session)}>
            {t.tryAgain}
          </button>
        </div>
      </Centered>
    );
  }
  const { session } = state;
  const logout = () => {
    // Log out in this browser even if the server can't be reached. Close the screen first, so the server closing the ended session's
    // live connection isn't wrongly announced as "Your login ended".
    saveSession(undefined);
    setLanguage("en");
    setAppearance("system");
    setState({ kind: "out" });
    void call(server(session), api.logout).catch(() => {});
  };
  /** Go to another account's place (a repo or "All"). Its address redraws the app frame and goes to the channel last seen there (mockup 101). */
  const switchTo = (workspace: string, place: string) => {
    remember(placeKey(workspace), place);
    go(lastPath(workspace, place) ?? format({ workspace }));
  };
  // The address picks the workspace before the effect above catches up, so the old one never draws a foreign address.
  const workspace = addressed ?? state.workspace;
  setWorkspace(workspace);
  // Signed in, but in no workspace yet: a server that takes access requests let them in to request one (ADR-0052).
  if (state.workspaces.length === 0)
    return (
      <Access
        session={session}
        me={state.me}
        onEnter={() => void enter(session)}
        onLogout={logout}
        onSignedOut={expire}
      />
    );
  return (
    <Workspace
      key={workspace}
      me={state.me}
      session={session}
      workspaces={state.workspaces}
      workspace={workspace}
      onSwitch={switchTo}
      onRepos={(repos) =>
        setState((now) =>
          now.kind === "in"
            ? {
                ...now,
                workspaces: now.workspaces.map((space) => ({
                  ...space,
                  repos: repos.filter((repo) => repo.split("/")[0]?.toLowerCase() === space.id),
                })),
              }
            : now,
        )
      }
      onLogout={logout}
      onSignedOut={expire}
      onReload={() => void enter(session)}
    />
  );
}

// The static demo answers the API in the browser (ADR-0058). Only the demo build has it.
if (import.meta.env.MODE === "demo") await import("./demo.ts");
followLinks();
createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
    <Tooltip />
  </StrictMode>,
);
