import React from "react";
import { Composition } from "remotion";
import { CommitClashVideo } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 1080x1920 vertical (TikTok / Reels / X mobile feed) */}
      <Composition
        id="CommitClashVertical"
        component={CommitClashVideo}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
      />
      {/* 1920x1080 landscape (X timeline / YouTube) */}
      <Composition
        id="CommitClashLandscape"
        component={CommitClashVideo}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
