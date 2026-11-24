import assert from "node:assert/strict";
import { test } from "node:test";
import { launcher, plist, task, unit } from "./service.ts";

const service = {
  args: [
    "/opt/node $24/bin/node",
    "/home/a&b/omagari/packages/cli/src/main.ts",
    "runner",
    "background",
  ],
  env: { PATH: "/usr/bin:/home/x/50%$HOME", CODEX_HOME: '/home/"q"\\c' },
  log: "/home/a<b>/.config/omagari/background.log",
};

test("the launchd agent runs the background runner at login with the carried environment, escaped as XML", () => {
  assert.equal(
    plist(service),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.github.omagari-dev.runner</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/node $24/bin/node</string>
    <string>/home/a&amp;b/omagari/packages/cli/src/main.ts</string>
    <string>runner</string>
    <string>background</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/bin:/home/x/50%$HOME</string>
    <key>CODEX_HOME</key>
    <string>/home/"q"\\c</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/home/a&lt;b&gt;/.config/omagari/background.log</string>
  <key>StandardErrorPath</key>
  <string>/home/a&lt;b&gt;/.config/omagari/background.log</string>
</dict>
</plist>
`,
  );
});

test("the systemd user unit quotes each word and doubles % (and $ in ExecStart)", () => {
  assert.equal(
    unit(service),
    `[Unit]
Description=Omagari background runner

[Service]
ExecStart="/opt/node $$24/bin/node" "/home/a&b/omagari/packages/cli/src/main.ts" "runner" "background"
Environment="PATH=/usr/bin:/home/x/50%%$HOME"
Environment="CODEX_HOME=/home/\\"q\\"\\\\c"
Restart=on-failure

[Install]
WantedBy=default.target
`,
  );
});

test("the Windows task starts only for this account at its logon, restarts on failure, and runs the launcher", () => {
  const xml = task("C:\\cfg\\omagari\\runner-launcher.cmd", "DESKTOP\\ana&co");
  assert.match(
    xml,
    /<LogonTrigger><Enabled>true<\/Enabled><UserId>DESKTOP\\ana&amp;co<\/UserId><\/LogonTrigger>/,
  );
  assert.match(xml, /<RestartOnFailure>/);
  assert.match(xml, /<RunLevel>LeastPrivilege<\/RunLevel>/);
  assert.match(
    xml,
    /<Command>cmd.exe<\/Command><Arguments>\/d \/s \/c "C:\\cfg\\omagari\\runner-launcher.cmd"<\/Arguments>/,
  );
});

test("the Windows launcher sets each value once, with % doubled and quotes dropped, and appends the runner's output to the log", () => {
  assert.equal(
    launcher({
      args: ["C:\\n&n\\node.exe", "main.ts", "runner", "background"],
      env: { PATH: 'C:\\50%X%;"C:\\a b"' },
      log: "C:\\log",
    }),
    [
      "@echo off",
      'set "PATH=C:\\50%%X%%;C:\\a b"',
      '"C:\\n&n\\node.exe" "main.ts" "runner" "background" >> "C:\\log" 2>&1',
      "",
    ].join("\r\n"),
  );
});
