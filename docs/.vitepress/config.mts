import { defineConfig } from "vitepress";
import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from "vitepress-plugin-group-icons";
import deflist from "markdown-it-deflist";
import llmstxt from "vitepress-plugin-llms";

export default defineConfig({
  title: "Max",
  description: "A federated data query layer for AI agents",
  cleanUrls: true,
  srcExclude: ["_*", "conversations/**", "img/**"],

  head: [
    // Favicon — replace with your own when ready
    // ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    // Logo — uncomment when you have one
    // logo: '/logo.svg',

    nav: [
      { text: "Guide", link: "/developer/" },
      { text: "Architecture", link: "/developer/architecture/" },
      { text: "Ideas", link: "/ideas/staging-and-agent-orchestration" },
    ],

    sidebar: {
      "/developer/": [
        {
          text: "Getting Started",
          items: [
            { text: "Developer Guide", link: "/developer/" },
            { text: "Core Concepts", link: "/developer/core-concepts" },
            {
              text: "Creating a Connector",
              link: "/developer/creating-an-integration",
            },
          ],
        },
        {
          text: "Data Model",
          collapsed: false,
          items: [
            {
              text: "Field Selection",
              link: "/developer/data-model/field-selection",
            },
            { text: "Meta Fields", link: "/developer/data-model/meta-fields" },
          ],
        },
        {
          text: "Systems",
          collapsed: false,
          items: [
            {
              text: "Synchronisation",
              link: "/developer/synchronisation-layer",
            },
            { text: "Operations", link: "/developer/operations" },
            { text: "Serialisation", link: "/developer/serialisation" },
            { text: "Error System", link: "/developer/error-system" },
          ],
        },
        {
          text: "Reference",
          collapsed: false,
          items: [
            { text: "Utilities & Patterns", link: "/developer/utilities" },
            {
              text: "Comprehensive Overview",
              link: "/developer/comprehensive-overview",
            },
          ],
        },
        {
          text: "Architecture",
          collapsed: false,
          items: [
            { text: "Overview", link: "/developer/architecture/" },
            {
              text: "Module Boundaries",
              link: "/developer/architecture/module-boundaries",
            },
          ],
        },
        {
          text: "Agent",
          collapsed: true,
          items: [
            { text: "llm-bootstrap", link: "/developer/agent/llm-bootstrap" },
          ],
        },
      ],
      "/ideas/": [
        {
          text: "Ideas & Design",
          items: [
            {
              text: "Staging & Orchestration",
              link: "/ideas/staging-and-agent-orchestration",
            },
            {
              text: "Field Freshness",
              link: "/ideas/field-freshness-and-incremental-sync",
            },
            {
              text: "Execution Harness",
              link: "/ideas/execution-harness-evolution",
            },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: "https://github.com/max-hq/max" }],

    search: {
      provider: "local",
    },

    footer: {
      message: "Released under the Apache 2.0 License.",
      copyright: "Max is a trademark of Metomic Ltd.",
    },
  },

  markdown: {
    codeTransformers: [transformerTwoslash()],
    config: (md) => {
      md.use(groupIconMdPlugin);
      md.use(deflist);
    },
  },

  vite: {
    plugins: [groupIconVitePlugin(), llmstxt()],
  },
});
