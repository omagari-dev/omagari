// Registers the background runner to start at login (ADR-0049): a launchd agent on macOS, a systemd user unit on Linux and WSL2, a Task Scheduler task on native Windows (ADR-0060).
import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, release } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execShim } from "@omagari/contract/shim";
import { stopBackground } from "@omagari/runner";

const MAIN = fileURLToPath(new URL(`./main${extname(import.meta.filename)}`, import.meta.url));
const LABEL = "com.github.omagari-dev.runner";
const UNIT = "omagari-runner.service";
const TASK = "omagari-runner";
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
/** What the runner needs from the shell `setup` runs in: `claude`, `codex` and `git` on PATH, the temp folder its sockets are in, and where configs are. */
const CARRIED = ["PATH", "TMPDIR", "XDG_CONFIG_HOME", "CLAUDE_CONFIG_DIR", "CODEX_HOME"];

type Service = { args: string[]; env: Record<string, string>; log: string };

const run = (file: string, ...args: string[]) => execShim(file, args); // finds the fake schtasks .cmd in tests
const configHome = () => process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
const plistFile = () => join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const unitFile = () => join(configHome(), "systemd", "user", UNIT);

/** Why the background runner can't be registered on this machine, or undefined if it can. */
export async function unsupported() {
  if (process.platform === "win32" || process.platform === "darwin") return undefined;
  if (process.platform !== "linux") return `No background runner on ${process.platform}`;
  if (
    await access("/run/systemd/system").then(
      () => true,
      () => false,
    )
  )
    return undefined;
  if (/microsoft/i.test(release()))
    return "WSL2 is running without systemd, so the background runner can't start at login. Add these lines to /etc/wsl.conf, run wsl --shutdown in Windows, open WSL2 again and run omagari setup again:\n[boot]\nsystemd=true";
  return "This Linux has no systemd, so the background runner can't start at login. Run omagari runner in each repo folder instead";
}

/** Registers the background runner to start at login and (re)starts it now. Returns one line on what it did. */
export async function register() {
  const why = await unsupported();
  if (why) return `Background runner: not registered. ${why}`;
  const service: Service = {
    args: [process.execPath, MAIN, "runner", "background"],
    env: Object.fromEntries(
      CARRIED.flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : [])),
    ),
    log: join(configHome(), "omagari", "background.log"),
  };
  if (process.platform === "win32") return registerWindows(service);
  if (process.platform === "darwin") {
    const file = plistFile();
    await mkdir(dirname(file), { recursive: true });
    await mkdir(dirname(service.log), { recursive: true, mode: 0o700 });
    await writeFile(file, plist(service));
    const domain = `gui/${process.getuid?.()}`;
    await run("launchctl", "bootout", `${domain}/${LABEL}`).catch(() => {}); // the one an earlier setup started
    await run("launchctl", "bootstrap", domain, file);
    return `Background runner: registered with launchd in ${file}. It starts at login, logs to ${service.log}, and watches the repos your agent sessions open.`;
  }
  const file = unitFile();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, unit(service));
  await run("systemctl", "--user", "daemon-reload");
  await run("systemctl", "--user", "enable", UNIT);
  await run("systemctl", "--user", "restart", UNIT);
  return `Background runner: registered with systemd in ${file}. It starts at login, logs to journalctl --user -u ${UNIT}, and watches the repos your agent sessions open.`;
}

/** Stops the background runner and removes its registration. Returns one line on what it did. */
export async function unregister() {
  if (process.platform === "win32") return unregisterWindows();
  if (process.platform === "darwin") {
    const file = plistFile();
    if (
      !(await access(file).then(
        () => true,
        () => false,
      ))
    )
      return "Background runner: none was registered.";
    await run("launchctl", "bootout", `gui/${process.getuid?.()}/${LABEL}`).catch(() => {});
    await rm(file);
    return `Background runner: stopped it and removed ${file}.`;
  }
  const file = unitFile();
  if (
    process.platform !== "linux" ||
    !(await access(file).then(
      () => true,
      () => false,
    ))
  )
    return "Background runner: none was registered.";
  await run("systemctl", "--user", "disable", "--now", UNIT).catch(() => {});
  await rm(file);
  await run("systemctl", "--user", "daemon-reload").catch(() => {});
  return `Background runner: stopped it and removed ${file}.`;
}

const taskFile = () => join(configHome(), "omagari", "runner-task.xml");

/** The command line the task and the Run key run: cmd.exe appends the runner's output to the log, which Task Scheduler can't do itself. */
function windowsCommand({ args, env, log }: Service) {
  const sets = Object.entries(env).map(([name, value]) => `set "${name}=${value}"&& `);
  return `${sets.join("")}${args.map((a) => `"${a}"`).join(" ")} >> "${log}" 2>&1`;
}

/** The task: for this account at its logon, at the default (limited) run level, restarted when it fails, hidden. */
export function task(service: Service) {
  return [
    `<?xml version="1.0" encoding="UTF-16"?>`,
    `<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">`,
    `  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>`,
    `  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>`,
    `  <Settings>`,
    `    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>`,
    `    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>`,
    `    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>`,
    `    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>`,
    `    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>`,
    `    <Hidden>true</Hidden>`,
    `  </Settings>`,
    `  <Actions Context="Author"><Exec><Command>cmd.exe</Command><Arguments>${xml(`/d /s /c "${windowsCommand(service)}"`)}</Arguments></Exec></Actions>`,
    `</Task>`,
    "",
  ].join("\r\n");
}

async function registerWindows(service: Service) {
  await stopBackground().catch(() => {}); // the one an earlier setup started
  await mkdir(dirname(service.log), { recursive: true });
  const file = taskFile();
  await writeFile(file, `\ufeff${task(service)}`, "utf16le");
  const created = await run("schtasks", "/Create", "/TN", TASK, "/XML", file, "/F").then(
    () => true,
    () => false,
  );
  if (created) {
    await run("schtasks", "/Run", "/TN", TASK);
    return `Background runner: registered with Task Scheduler as ${TASK}. It starts at login, logs to ${service.log}, and watches the repos your agent sessions open.`;
  }
  // No rights to make a task: the per-user Run key needs none (ADR-0060).
  // ponytail: the Run key has no restart on crash; the runner restarting its own child comes with the hand check.
  const command = `cmd.exe /d /s /c "${windowsCommand(service)}"`;
  await run("reg", "add", RUN_KEY, "/v", TASK, "/t", "REG_SZ", "/d", command, "/f");
  spawn("cmd.exe", ["/d", "/s", "/c", windowsCommand(service)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    windowsVerbatimArguments: true,
  }).unref();
  return `Background runner: Task Scheduler needs admin rights here, so it is registered in the Run key instead. It starts at login, logs to ${service.log}, and watches the repos your agent sessions open. It won't restart itself if it crashes.`;
}

async function unregisterWindows() {
  await stopBackground().catch(() => {});
  const ok = () => true;
  const no = () => false;
  const task = await run("schtasks", "/Delete", "/TN", TASK, "/F").then(ok, no);
  const key = !task && (await run("reg", "delete", RUN_KEY, "/v", TASK, "/f").then(ok, no));
  await rm(taskFile(), { force: true });
  return task || key
    ? `Background runner: stopped it and removed ${task ? "its Task Scheduler task" : "its Run key entry"}.`
    : "Background runner: none was registered.";
}

const xml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The launchd agent. KeepAlive starts it again if it crashes. */
export function plist({ args, env, log }: Service) {
  const strings = (values: string[]) => values.map((v) => `    <string>${xml(v)}</string>`);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key>`,
    `  <string>${LABEL}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    ...strings(args),
    `  </array>`,
    `  <key>EnvironmentVariables</key>`,
    `  <dict>`,
    ...Object.entries(env).flatMap(([name, value]) => [
      `    <key>${xml(name)}</key>`,
      `    <string>${xml(value)}</string>`,
    ]),
    `  </dict>`,
    `  <key>RunAtLoad</key>`,
    `  <true/>`,
    `  <key>KeepAlive</key>`,
    `  <true/>`,
    `  <key>StandardOutPath</key>`,
    `  <string>${xml(log)}</string>`,
    `  <key>StandardErrorPath</key>`,
    `  <string>${xml(log)}</string>`,
    `</dict>`,
    `</plist>`,
    "",
  ].join("\n");
}

/** One quoted systemd word. `%` starts a specifier, so it's doubled (systemd.unit, "Specifiers"). */
const quoted = (value: string) => `"${value.replace(/[\\"]/g, "\\$&").replaceAll("%", "%%")}"`;
/** In ExecStart `$` also starts a variable, so it's doubled too (systemd.service, "Command lines"). */
const command = (value: string) => quoted(value).replaceAll("$", "$$$$");

/** The systemd user unit. It starts with the user's session (default.target) and again if it crashes. */
export function unit({ args, env }: Service) {
  return [
    "[Unit]",
    "Description=Omagari background runner",
    "",
    "[Service]",
    `ExecStart=${args.map(command).join(" ")}`,
    ...Object.entries(env).map(([name, value]) => `Environment=${quoted(`${name}=${value}`)}`),
    "Restart=on-failure",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}
