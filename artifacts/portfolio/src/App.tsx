import { useEffect } from "react";
import CanvasLoader from "./components/common/CanvasLoader";
import MobileProjectsOverlay from "./components/common/MobileProjectsOverlay";
import MobileWorkOverlay from "./components/common/MobileWorkOverlay";
import MotionPermissionPrompt from "./components/common/MotionPermissionPrompt";
import ScrollWrapper from "./components/common/ScrollWrapper";
import Experience from "./components/experience";
import Footer from "./components/footer";
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
          <Footer/>
        </ScrollWrapper>
      </CanvasLoader>
      <MotionPermissionPrompt />
      <MobileProjectsOverlay />
      <MobileWorkOverlay />
    </>
  );
};

export default App;
