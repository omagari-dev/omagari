import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import "./brand.css";
import Landing from "./Landing.vue";

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      // Only the home page (layout: home) renders this slot.
      "home-hero-after": () => h(Landing),
      "home-hero-actions-after": () =>
        h("p", { class: "beta-note" }, "Free hosted beta. Ask for access and we'll let you in."),
    }),
};
