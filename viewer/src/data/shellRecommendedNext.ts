/**
 * Surfaces inside this Modulr.Core shell — shown in “Recommended next” (Code-style list).
 */
export type ShellRecommendedItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  href: string;
};

/** Methods is listed last — wire catalog is primarily for development / QA. */
export const SHELL_RECOMMENDED_NEXT: ShellRecommendedItem[] = [
  {
    id: "inspector",
    name: "Inspector",
    category: "Operations",
    description:
      "Module health, wire metrics, and mock charts — the operator view for how this Core instance looks from the outside.",
    href: "/inspector",
  },
  {
    id: "profile",
    name: "Profile",
    category: "Identity",
    description:
      "Public profile mock with balances, bricks, and resolution preview — useful before real sign-in lands.",
    href: "/profile",
  },
  {
    id: "organizations",
    name: "Organizations",
    category: "Governance",
    description:
      "Register a namespace and explore mock controls for members, invites, treasury limits, and app access.",
    href: "/organizations",
  },
  {
    id: "resolve",
    name: "Resolve",
    category: "Names",
    description:
      "Try name resolution end-to-end with your endpoints — see how answers come back from this shell’s Core.",
    href: "/resolve",
  },
  {
    id: "publish",
    name: "Publish",
    category: "Developers",
    description:
      "List a module — Modulr calendar version, ratings, pricing & trials, Markdown ToS, certification / MTR, multi-role packages, icon.",
    href: "/publish",
  },
  {
    id: "methods",
    name: "Methods",
    category: "Protocol · dev",
    description:
      "POST /message catalog against your Core — debugging and contract checks for builders; most users never need this screen.",
    href: "/methods",
  },
];
