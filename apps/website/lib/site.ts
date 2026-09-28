export const siteConfig = {
  name: "Headless LMS",
  tagline: "The API-first platform for building learning systems",
  description:
    "An open-source, API-first headless LMS built in modern TypeScript. Composable adapters and extendable with plugins.",
  url: "https://headless-lms.dev",
  githubUrl: "https://github.com/mdwt/headless-lms",
  installCommand: "npm create headless-lms",
  twitterHandle: "@meiringdw",
  author: "Meiring de Wet",
  license: "MIT",
  repo: "mdwt/headless-lms",
};

export const primaryNav = [
  { title: "Docs", href: "/docs" },
  { title: "API", href: "/docs/api" },
  { title: "Blog", href: "/blog" },
  { title: "Changelog", href: "/changelog" },
];

export function absoluteUrl(path: string) {
  return `${siteConfig.url}${path}`;
}

export function markdownUrl(path: string) {
  return absoluteUrl(`${path}.md`);
}
