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

  head: [
    // Favicon — replace with your own when ready
    // ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    // Logo — uncomment when you have one
    // logo: '/logo.svg',

    nav: [
      { text: "Guide", link: "/getting-started/what-is-max" },
      { text: "Concepts", link: "/concepts/core-types" },
      { text: "Connectors", link: "/guides/building-a-connector" },
      { text: "Changelog", link: "/changelog" },
    ],

    sidebar: {
      "/getting-started/": [
        {
          text: "Getting Started",
          items: [
            { text: "What is Max?", link: "/getting-started/what-is-max" },
            { text: "Installation", link: "/getting-started/installation" },
            { text: "Quick Start", link: "/getting-started/quick-start" },
          ],
        },
      ],
      "/concepts/": [
        {
          text: "Concepts",
          items: [
            { text: "Core Types", link: "/concepts/core-types" },
            { text: "Scope", link: "/concepts/scope" },
            { text: "Architecture", link: "/concepts/architecture" },
          ],
        },
      ],
      "/guides/": [
        {
          text: "Guides",
          items: [
            {
              text: "Building a Connector",
              link: "/guides/building-a-connector",
            },
            { text: "Using the CLI", link: "/guides/using-the-cli" },
            { text: "AI Agent Usage", link: "/guides/ai-agent-usage" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Utilities", link: "/reference/utilities" },
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
