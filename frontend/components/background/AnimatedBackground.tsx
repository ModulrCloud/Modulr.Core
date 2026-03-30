"use client";

import { useAppUi } from "@/components/providers/AppProviders";
import { useEffectiveMotion } from "@/hooks/useEffectiveMotion";

import { AuroraLayer } from "./AuroraLayer";
import { FireflyField } from "./FireflyField";
import { BrickField } from "./BrickField";
import { GameOfLifeField } from "./GameOfLifeField";
import { MetaballField } from "./MetaballField";

export function AnimatedBackground() {
  const { settings } = useAppUi();
  const motionOk = useEffectiveMotion(settings.motionMode);

  if (!settings.backgroundEnabled) {
    return (
      <div
        className="fixed inset-0 z-0 bg-[var(--modulr-page-bg)]"
        aria-hidden
      />
    );
  }

  const preset = settings.backgroundPreset;
  const isAurora = preset === "aurora";
  const isMetaballs = preset === "metaballs";

  const firefliesActive =
    preset === "fireflies" && motionOk && settings.backgroundEnabled;

  const metaballsVisible = preset === "metaballs";
  const lifeVisible = preset === "life";
  const brickVisible = preset === "brick";

  const richGradient =
    !isAurora &&
    !isMetaballs &&
    !lifeVisible &&
    !brickVisible &&
    (preset === "gradient" || (preset === "fireflies" && !motionOk));

  return (
    <>
      <div
        className="fixed inset-0 z-0 bg-[var(--modulr-page-bg)]"
        aria-hidden
      />
      {isAurora && (
        <>
          <div
            className="pointer-events-none fixed inset-0 z-0 opacity-90"
            style={{
              background:
                "linear-gradient(165deg, var(--modulr-page-bg-2), var(--modulr-page-bg))",
            }}
            aria-hidden
          />
          <AuroraLayer
            colorMode={settings.colorMode}
            animated={motionOk}
          />
        </>
      )}
      {!isAurora && (
        <div
          className="pointer-events-none fixed inset-0 z-0 opacity-90"
          style={{
            background: richGradient
              ? "radial-gradient(ellipse 120% 80% at 50% 20%, rgba(255,183,0,0.14), transparent 55%), radial-gradient(ellipse 90% 60% at 80% 90%, rgba(120,140,255,0.08), transparent 50%), linear-gradient(165deg, var(--modulr-page-bg-2), var(--modulr-page-bg))"
              : "linear-gradient(165deg, var(--modulr-page-bg-2), var(--modulr-page-bg))",
          }}
          aria-hidden
        />
      )}
      <FireflyField
        active={firefliesActive}
        colorMode={settings.colorMode}
      />
      <MetaballField visible={metaballsVisible} animate={motionOk} />
      <GameOfLifeField visible={lifeVisible} animate={motionOk} />
      <BrickField
        visible={brickVisible}
        animate={motionOk}
        colorMode={settings.colorMode}
      />
    </>
  );
}
