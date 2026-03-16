import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { visit } from "unist-util-visit";

/** Rehype plugin: transforms ```mermaid code blocks into <pre class="mermaid"> for client-side rendering. */
function rehypeMermaid() {
  return (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (
        node.tagName !== "pre" ||
        !node.children?.[0] ||
        node.children[0].tagName !== "code"
      )
        return;

      const code = node.children[0];
      const classes = code.properties?.className || [];
      if (!classes.includes("language-mermaid")) return;

      // Extract the text content from the code element
      const text = code.children
        ?.filter((c) => c.type === "text")
        .map((c) => c.value)
        .join("");

      // Replace with <pre class="mermaid">text</pre>
      node.properties = { className: ["mermaid"] };
      node.children = [{ type: "text", value: text }];
    });
  };
}

export default defineConfig({
  markdown: {
    rehypePlugins: [rehypeMermaid],
  },
  integrations: [
    starlight({
      title: "Max",
      description: "A federated data query layer for AI agents",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/max-hq/max",
        },
      ],
      sidebar: [
        {
          label: "Guide",
          autogenerate: { directory: "guide" },
        },
        {
          label: "CLI",
          autogenerate: { directory: "cli" },
        },
        {
          label: "Connector SDK",
          autogenerate: { directory: "connector" },
        },
        {
          label: "SDK Reference",
          autogenerate: { directory: "reference" },
        },
        {
          label: "Architecture",
          autogenerate: { directory: "architecture" },
        },
      ],
      head: [
        {
          tag: "script",
          attrs: { type: "module" },
          content: `
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
`,
        },
      ],
    }),
  ],
});
