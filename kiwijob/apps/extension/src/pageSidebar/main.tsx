import React from "react";
import { createRoot } from "react-dom/client";
import { KiwiJobPanel } from "../panel/PanelApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <KiwiJobPanel />
  </React.StrictMode>,
);
