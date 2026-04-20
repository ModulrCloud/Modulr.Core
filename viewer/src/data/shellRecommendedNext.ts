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
    id: "methods",
    name: "Methods",
    category: "Protocol",
    description:
      "Browse POST /message methods, request shapes, and catalog entries wired to the Core you have configured in settings.",
    href: "/methods",
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
];
