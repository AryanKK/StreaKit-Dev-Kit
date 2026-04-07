import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'StreaKit SDK',
  description: 'Public docs and integration guides for the StreaKit SDK.',
  lang: 'en-US',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/reference/core-api' },
      { text: 'Playground', link: '/playground' }
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'React Integration', link: '/guide/react-integration' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Core API', link: '/reference/core-api' },
          { text: 'Deployment', link: '/reference/deployment' }
        ]
      },
      {
        text: 'Live Demo',
        items: [{ text: 'Playground', link: '/playground' }]
      }
    ],
    search: {
      provider: 'local'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/AryanKK/StreaKit-Dev-Kit' }
    ],
    footer: {
      message: 'Built for developers shipping streak experiences.',
      copyright: 'Copyright 2026 StreaKit'
    }
  }
});
