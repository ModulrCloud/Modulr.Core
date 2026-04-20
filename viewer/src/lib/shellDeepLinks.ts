/** Anchor id on the home page for the sign-in panel (`WelcomeHome`). */
export const SHELL_SIGN_IN_SECTION_ID = "shell-sign-in";

/** React Router `to` for deep-linking to the sign-in section (hash is without `#`). */
export const routeToShellSignInSection = {
  pathname: "/" as const,
  hash: SHELL_SIGN_IN_SECTION_ID,
};

export function isShellSignInLocationHash(hash: string): boolean {
  return hash === `#${SHELL_SIGN_IN_SECTION_ID}`;
}
