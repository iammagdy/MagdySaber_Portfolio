import { useEffect } from "react";
import CanvasLoader from "./components/common/CanvasLoader";
import ContactOverlay from "./components/common/ContactOverlay";
import ExperienceOverlay from "./components/common/ExperienceOverlay";
import MobileProjectsOverlay from "./components/common/MobileProjectsOverlay";
import MobileWorkOverlay from "./components/common/MobileWorkOverlay";
import MotionPermissionPrompt from "./components/common/MotionPermissionPrompt";
import ScrollWrapper from "./components/common/ScrollWrapper";
import Experience from "./components/experience";
import Hero from "./components/hero";
import DevkitPage from "./components/devkit/DevkitPage";
import { installTracker } from "./lib/devkitTracker";
import { useSettingsStore } from "./stores";

const App = () => {
  const isDevkit = typeof window !== "undefined" && window.location.pathname.startsWith("/devkit");

  useEffect(() => {
    if (!isDevkit) installTracker();
  }, [isDevkit]);

  useEffect(() => {
    if (!isDevkit) {
      useSettingsStore.getState().fetchSettings();
    }
  }, [isDevkit]);

  if (isDevkit) return <DevkitPage />;

  return (
    <>
      <CanvasLoader>
        <ScrollWrapper>
          <Hero/>
          <Experience/>
        </ScrollWrapper>
      </CanvasLoader>
      <ExperienceOverlay />
      <ContactOverlay />
      <MotionPermissionPrompt />
      <MobileProjectsOverlay />
      <MobileWorkOverlay />
    </>
  );
};

export default App;
