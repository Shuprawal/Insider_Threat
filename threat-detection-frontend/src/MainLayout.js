// MainLayout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";
import GlobalAlertBanner from "./components/GlobalAlertBanner";
// import EmergencyOverlay from "./components/EmergencyOverlay";
// import { useAlerts } from "./components/GlobalAlertsProvider";
// import { useRealtimeSettings } from "./components/RealtimeSettingsContext";

export default function MainLayout({ setAuth }) {
  // const { emergency } = useAlerts();
  // const { settings: s } = useRealtimeSettings() || {};

  // const NAVBAR_HEIGHT = 64;   // adjust to your actual navbar height
  // const BANNER_HEIGHT = 96;   // approx height of the fixed banner

  return (
    <>
      <Navbar setAuth={setAuth} />
      <GlobalAlertBanner />

      <Outlet />
    </>
  );
}
