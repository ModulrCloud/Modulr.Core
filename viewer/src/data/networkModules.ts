/**
 * First-party Modulr network surfaces shown on the home “Explore” rail.
 * `href` null means the surface is not wired in this shell yet.
 */
export type NetworkModule = {
  id: string;
  name: string;
  category: string;
  description: string;
  /** In-app path (e.g. `/inspector`) or absolute URL. */
  href: string | null;
};

export const NETWORK_MODULES: NetworkModule[] = [
  {
    id: "code",
    name: "Modulr.Code",
    category: "Creative suite",
    description:
      "Authoring, scripts, and sync across your workspace — structure and delivery for builders.",
    href: null,
  },
  {
    id: "gig",
    name: "Modulr.Gig",
    category: "Work & economy",
    description:
      "Gigs, reputation, and paid flows on the network — match talent to work with verifiable history.",
    href: null,
  },
  {
    id: "social",
    name: "Modulr.Social",
    category: "People & feeds",
    description:
      "Social graph, discovery, and presence — find people and modules in one place.",
    href: null,
  },
  {
    id: "assets",
    name: "Modulr.Assets",
    category: "Custody",
    description:
      "Issuance, custody context, and registry-aligned metadata for digital assets.",
    href: "/products/modulr-assets",
  },
  {
    id: "storage",
    name: "Modulr.Storage",
    category: "Data plane",
    description:
      "Durable objects and blob tiering with module-scoped access and quotas.",
    href: "/products/modulr-storage",
  },
  {
    id: "desktop",
    name: "Modulr.Desktop",
    category: "Workspace",
    description:
      "Desktop shell, featured modules, and session-aware layouts for focused work.",
    href: "/products/modulr-desktop",
  },
];
