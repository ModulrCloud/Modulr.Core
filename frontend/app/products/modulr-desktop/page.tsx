import { redirect } from "next/navigation";

/** Legacy URL — Modulr.Desktop was renamed to Modulr.OS (Omni interface, multi-device). */
export default function ModulrDesktopRedirectPage() {
  redirect("/products/modulr-os");
}
