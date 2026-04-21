import { Navigate, Route, Routes } from "react-router-dom";

import { WelcomeHome } from "@/components/home/WelcomeHome";
import { InspectorMock } from "@/components/inspector/InspectorMock";
import { MethodsMock } from "@/components/methods/MethodsMock";
import { OrganizationsMock } from "@/components/organizations/OrganizationsMock";
import { ModulePublishMock } from "@/components/publish/ModulePublishMock";
import { AppProviders } from "@/components/providers/AppProviders";
import { PublicProfileMock } from "@/components/profile/PublicProfileMock";
import { ResolveMock } from "@/components/resolve/ResolveMock";
import { AppShell } from "@/components/shell/AppShell";
import {
  ModulrAssetsProductPage,
  ModulrOsProductPage,
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
          <Route path="/organizations" element={<OrganizationsMock />} />
          <Route path="/registration" element={<Navigate to="/organizations" replace />} />
          <Route path="/resolve" element={<ResolveMock />} />
          <Route path="/methods" element={<MethodsMock />} />
          <Route path="/publish" element={<ModulePublishMock />} />
          <Route path="/products/modulr-assets" element={<ModulrAssetsProductPage />} />
          <Route path="/products/modulr-storage" element={<ModulrStorageProductPage />} />
          <Route path="/products/modulr-os" element={<ModulrOsProductPage />} />
          <Route path="/products/modulr-desktop" element={<Navigate to="/products/modulr-os" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </AppProviders>
  );
}
