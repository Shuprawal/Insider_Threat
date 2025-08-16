// // MainLayout.jsx
// import React from "react";
// import { Outlet } from "react-router-dom";
// import Navbar from "./components/Navbar";
// import GlobalAlertBanner from "./components/GlobalAlertBanner";
//
//
// export default function MainLayout({ setAuth }) {
//
//   return (
//     <>
//       <Navbar setAuth={setAuth} />
//       <GlobalAlertBanner />
//
//       <Outlet />
//     </>
//   );
// }

// MainLayout.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";
import GlobalAlertBanner from "./components/GlobalAlertBanner";
import { useMe } from "./components/RoleGuards";

export default function MainLayout({ setAuth }) {
  const { me, loading } = useMe();

  const role = (me?.role || "").toLowerCase();
  // Show nav only to admin OR Django superuser (and optionally role "superuser")
  const canSeeNav = !!(me && (me.is_superuser || role === "admin" || role === "superuser"));

  return (
    <>
      {!loading && canSeeNav && <Navbar setAuth={setAuth} />}
      <GlobalAlertBanner />
      <Outlet />
    </>
  );
}
