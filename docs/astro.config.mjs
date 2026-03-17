import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import d2 from "astro-d2";

export default defineConfig({
  integrations: [
    d2({ theme: { default: "200", dark: "200" } }),
    starlight({
      title: 'Max',
      logo: {
        light: './src/assets/max-logo-inline-light.svg',
        dark: './src/assets/max-logo-inline-dark.svg',
        replacesTitle: true
      },
      description: 'A federated data query layer for AI agents',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/max-hq/max',
        },
      ],
      sidebar: [
        {
          label: 'Guide',
          autogenerate: { directory: 'guide' },
        },
        {
          label: 'CLI',
          autogenerate: { directory: 'cli' },
        },
        {
          label: 'Connector SDK',
          autogenerate: { directory: 'connector' },
        },
        {
          label: 'SDK Reference',
          autogenerate: { directory: 'reference' },
        },
        {
          label: 'Architecture',
          autogenerate: { directory: 'architecture' },
        },
      ],
    }),
  ],
})
