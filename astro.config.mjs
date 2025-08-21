import { defineConfig } from 'astro/config';
import tailwind from "@astrojs/tailwind";
import icon from "astro-icon";
import mdx from "@astrojs/mdx";

import react from "@astrojs/react";

import svelte from "@astrojs/svelte";

// https://astro.build/config
export default defineConfig({
  site: "https://jeahun00.github.io",
  base: "/MoCHA-former-project-page",
  integrations: [tailwind(), icon(), mdx(), react(), svelte()],
  markdown: {
    shikiConfig: {
      themes: {
        dark: 'github-dark',
      },
    }
  }
});