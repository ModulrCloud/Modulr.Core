import { Route, Routes } from "react-router-dom";

import { WelcomeHome } from "@/components/home/WelcomeHome";
import { InspectorMock } from "@/components/inspector/InspectorMock";
import { MethodsMock } from "@/components/methods/MethodsMock";
import { AppProviders } from "@/components/providers/AppProviders";
import { PublicProfileMock } from "@/components/profile/PublicProfileMock";
import { RegistrationMock } from "@/components/registration/RegistrationMock";
import { ResolveMock } from "@/components/resolve/ResolveMock";
import { AppShell } from "@/components/shell/AppShell";
import {
  ModulrAssetsProductPage,
  ModulrDesktopProductPage,
  ModulrStorageProductPage,
} from "@/pages/ProductPages";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function App() {
  return (
    <AppProviders>
      <AppShell>
        <Routes>
          <Route path="/" element={<WelcomeHome />} />
          <Route path="/inspector" element={<InspectorMock />} />
          <Route path="/profile" element={<PublicProfileMock />} />
          <Route path="/registration" element={<RegistrationMock />} />
          <Route path="/resolve" element={<ResolveMock />} />
          <Route path="/methods" element={<MethodsMock />} />
          <Route path="/products/modulr-assets" element={<ModulrAssetsProductPage />} />
          <Route path="/products/modulr-storage" element={<ModulrStorageProductPage />} />
          <Route path="/products/modulr-desktop" element={<ModulrDesktopProductPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </AppProviders>
  );
}
