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

/** Keep the rail scannable — additional modules go on the next “page” in `ExploreNetworkModules`. */
export const EXPLORE_MODULES_PAGE_SIZE = 6;

/**
 * Ordered catalog (Omni / multiple form factors; not only desktop).
 * Page 1 leans creative + identity; page 2 adds platform, economy, AI, and gaming.
 */
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
    id: "office",
    name: "Modulr.Office",
    category: "Productivity",
    description:
      "Docs, slides, and spreadsheets tied to live databases — manage data with familiar UI instead of raw tables alone.",
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
    id: "os",
    name: "Modulr.OS",
    category: "Omni interface",
    description:
      "Shell experience across desktop, mobile, TV, wearables — the Modulr Omni front end; Linux distribution planned.",
    href: "/products/modulr-os",
  },
  {
    id: "ads",
    name: "Modulr.Ads",
    category: "Network economy",
    description:
      "Optional ads and sponsored tasks so using the network doesn’t always mean paying out of pocket — modules can reward attention and micro-tasks.",
    href: null,
  },
  {
    id: "ai",
    name: "Modulr.AI",
    category: "Intelligence",
    description:
      "Central AI — major providers plus hosted models; share idle GPU with the network and earn for useful compute.",
    href: null,
  },
  {
    id: "gaming",
    name: "Modulr.Gaming",
    category: "Experiences",
    description:
      "Decentralized game-server capacity — studios set rates; capacity appears as players show up, without owning all the metal.",
    href: null,
  },
];
