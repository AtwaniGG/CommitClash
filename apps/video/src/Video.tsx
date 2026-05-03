import React from "react";
import { AbsoluteFill, Audio, Sequence, Series, staticFile } from "remotion";
import { loadFont as loadPressStart } from "@remotion/google-fonts/PressStart2P";
import { loadFont as loadVT323 } from "@remotion/google-fonts/VT323";
import { SceneLogo } from "./scenes/SceneLogo";
import { SceneGameplay } from "./scenes/SceneGameplay";
import { SceneOutro } from "./scenes/SceneOutro";

loadPressStart();
loadVT323();

/**
 * 15-second launch trailer:
 *   0:00 - 0:03  SceneLogo     (90 frames)
 *   0:03 - 0:11  SceneGameplay (240 frames)
 *   0:11 - 0:15  SceneOutro    (120 frames)
 */
export function CommitClashVideo() {
  return (
    <AbsoluteFill>
      {/* Atmospheric drone underneath everything — glues hard cuts together */}
      <Audio src={staticFile("sfx/drone.wav")} volume={0.35} />

      <Series>
        <Series.Sequence durationInFrames={90}>
          <SceneLogo />
        </Series.Sequence>
        <Series.Sequence durationInFrames={240}>
          <SceneGameplay />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <SceneOutro />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}
