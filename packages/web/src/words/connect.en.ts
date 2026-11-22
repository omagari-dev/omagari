/** "Getting started" and the repo Share notice (#354, #433, DESIGN.md "Getting started"). */
export const connectEn = {
  title: "Getting started",
  /** "1/4" */
  progress: (done: number, total: number) => `${done}/${total}`,
  next: (step: string) => `Next: ${step}`,
  hide: "Hide",
  needs:
    "You need: Node.js 24.12 or later · Claude Code or Codex, signed in · a GitHub repo you can push to",
  steps: {
    login: "Log in",
    connect: "Connect your computer",
    share: "Share your repo",
    work: "See your work",
  },
  connectBody: "Run these two lines in a terminal.",
  install: "Install Omagari",
  setup: "Connect to this server",
  copy: "Copy",
  copied: "Copied",
  setupDoes:
    "Setup opens your browser so you can enter a code on GitHub. It puts the hooks into your agents, and the runner starts by itself every time your computer starts.",
  remove: "To remove it:",
  pasteToAgent: "You can also paste the two lines to your agent and ask it to run them.",
  codex: "Using Codex? Trust the Omagari hooks in /hooks.",
  stuck: "Stuck?",
  /** Each common error: the code as it shows in the terminal, then what to do. */
  errors: [
    {
      code: "command not found: omagari",
      fix: "Open a new terminal. Still there? Check that the bin folder of npm prefix -g is on your PATH.",
    },
    { code: "EACCES", fix: "Don't use sudo. Install Node with nvm or fnm and try again." },
    { code: "node -v", fix: "says below 24.12? Install a newer Node." },
  ],
  more: "Anything else?",
  troubleshooting: "See Troubleshooting",
  connected: (executors: string) => (executors ? `Connected · ${executors}` : "Connected"),
  shareBody: "Open Claude Code in the repo folder and press Share. From a terminal:",
  whatGoes: "What goes to the server?",
  workBody: "You're done once your status line shows in the member list.",
  phoneTitle: "Do this on a computer",
  phoneBody: (host: string) => `Open ${host} on your computer and pick up here.`,
  invite: "Invite teammates",
  inviteBody:
    "Send them this address. Anyone with push access to the repo gets in, no invite needed.",
  copyAddress: "Copy address",
  example: "This is what it looks like when it works",
  exampleLine: "Changing the session check on the login screen",
  exampleConflict: "Indirect conflict",
  welcome: "Welcome!",
  welcomeBody:
    "Four steps and you and your teammates see each other's agent work. Clashes show up before the merge.",
  connectHint: "Two lines in a terminal, about 2 minutes",
  skip: "Skip",
  start: "Start",
  later: "Later",
  gotIt: "Got it",
  close: "Close",
  allSet: "You're all set!",
  allSetBody:
    "When your work clashes with a teammate's, you'll hear about it here. Send your teammates this address.",
  notShared: "You haven't shared this repo yet, so your teammates can't see your work in it.",
  share: "Share",
  shareFailed: "Couldn't share that. Try again in a bit?",
  /** A hit limit (ADR-0052), with its number. */
  limit: {
    requests: (max: number) => `Hit the limit of ${max} requests a minute. Try again in a minute?`,
    repos: (max: number) =>
      `This workspace can have up to ${max} repos. Remove one to add another.`,
    storage: (max: number) =>
      `This workspace is over its ${max} MB of storage. Ask the server's operators.`,
  },
  closeLimit: "Close",
};
