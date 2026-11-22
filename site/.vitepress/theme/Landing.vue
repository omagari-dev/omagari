<script setup lang="ts">
const steps = [
  {
    title: "Work shows up",
    text: "The runner sees a teammate's agent start on a branch, and shows it next to their name.",
    img: "step-1.png",
    alt: "A member in the Members panel, showing one work",
  },
  {
    title: "Conflict alert",
    text: "Your branch and theirs touch the same function. Both of you hear about it.",
    img: "step-2.png",
    alt: "An alert post: an indirect conflict between feat/payment-model and feat/wallet, in src/pay.ts",
  },
  {
    title: "Merge run",
    text: "A runner merges the two in a sandbox and runs your check command.",
    img: "step-3.png",
    alt: "A merge run result: Fails, breaks when merged, both pass on their own",
  },
  {
    title: "Decision",
    text: "They settle it in the post. The decision lands in the repo as a PR.",
    img: "step-4.png",
    alt: "A decision card: Proposed, with Agree and Object buttons and a link to the PR",
  },
];
</script>

<template>
  <div class="landing">
    <section class="flow">
      <h2>From heads-up to decision.</h2>
      <p class="lead">
        One conflict, start to end. Everyone keeps their own agent, Claude Code or Codex, and can
        ask a teammate's agent instead of pulling them out of their work.
      </p>
      <ol class="steps">
        <li v-for="(s, i) in steps" :key="s.title">
          <span class="n">{{ i + 1 }}</span>
          <h3>{{ s.title }}</h3>
          <p>{{ s.text }}</p>
          <img :src="`/${s.img}`" :alt="s.alt" loading="lazy" />
        </li>
      </ol>
    </section>

    <section id="what-leaves-your-computer" class="data">
      <h2>What leaves your computer.</h2>
      <p class="lead">
        Your runner sends what your team needs to spot conflicts. Here's exactly what, and what
        never goes.
      </p>
      <div class="cols">
        <div>
          <h3>Goes to your team's server</h3>
          <ul>
            <li>Branch names, and the paths of the files you changed</li>
            <li>
              The content of those files, at the default share level (<code>full</code>). Never
              <code>.env</code> files, gitignored files, binaries, or files over 512 KiB
            </li>
            <li>Your status line, and the answers your agent gives in Q&amp;A</li>
          </ul>
        </div>
        <div>
          <h3>Stays on your computer</h3>
          <ul>
            <li>Files you didn't change</li>
            <li>Your agent's sessions</li>
            <li>Repos outside your team's GitHub accounts</li>
          </ul>
        </div>
      </div>
      <p class="foot">
        Want to send less? <code>omagari runner --share declared</code> sends paths, and content
        only where you've claimed. <code>intent</code> sends just your branch names and status
        line. Done with it? <code>omagari uninstall</code> stops the runner, and you can delete
        your account in Settings. See the <a href="/privacy">Privacy policy</a>.
      </p>
    </section>

    <section class="ways">
      <h2>Two ways to run it.</h2>
      <div class="two">
        <div class="way">
          <h3>Hosted beta</h3>
          <ul>
            <li>Free while it's a beta</li>
            <li>Ask for access and we'll let you in</li>
            <li>Your team's records live on our server</li>
          </ul>
          <a class="pill primary" href="https://app.omagari.org">Open app</a>
        </div>
        <div class="way">
          <h3>Your own server</h3>
          <ul>
            <li>Free, no one to ask</li>
            <li>Your team's records stay on your server</li>
            <li>Your team opens straight into the app</li>
          </ul>
          <a class="pill ghost" href="/server">Self-host</a>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.landing {
  --muted: var(--vp-c-text-2);
  --line: var(--vp-c-divider);
}
section {
  max-width: 1152px;
  margin: 0 auto;
  padding: 112px 32px 0;
}
.ways {
  padding-bottom: 64px;
}
h2 {
  margin: 0;
  border: 0;
  padding: 0;
  font-size: 40px;
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: -0.28px;
  text-align: center;
}
h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.lead {
  margin: 12px auto 0;
  max-width: 640px;
  font-size: 17px;
  line-height: 1.47;
  color: var(--muted);
  text-align: center;
}
.steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 48px 0 0;
  padding: 0;
  list-style: none;
}
.steps .n {
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}
.steps h3 {
  margin: 6px 0 4px;
}
.steps p {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.43;
  color: var(--muted);
}
.steps img {
  display: block;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 11px;
}
.data {
  max-width: 880px;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-top: 40px;
}
.cols > div {
  border-top: 2px solid var(--vp-c-text-1);
  padding-top: 14px;
}
.cols h3 {
  margin-bottom: 8px;
}
ul {
  margin: 0;
  padding-left: 18px;
  list-style: disc;
  font-size: 15px;
  line-height: 1.6;
}
.foot {
  margin-top: 24px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--muted);
}
.ways {
  max-width: 880px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 40px;
}
.way {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 28px;
}
.way h3 {
  margin-bottom: 8px;
  font-size: 21px;
}
.way ul {
  font-size: 17px;
  line-height: 1.47;
}
.way li {
  margin: 6px 0;
}
.way .pill {
  margin-top: 20px;
}
.pill {
  display: inline-block;
  padding: 11px 22px;
  border-radius: 980px;
  font-size: 17px;
  line-height: 1.24;
  text-decoration: none;
}
.pill.primary {
  background: var(--vp-c-brand-3);
  color: #fff;
}
.pill.primary:hover {
  background: var(--vp-c-brand-2);
}
.pill.ghost {
  border: 1px solid var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
section.data {
  scroll-margin-top: 72px;
}
@media (max-width: 760px) {
  section {
    padding: 72px 20px 0;
  }
  h2 {
    font-size: 34px;
  }
  .steps,
  .cols,
  .two {
    grid-template-columns: 1fr;
  }
}
</style>
