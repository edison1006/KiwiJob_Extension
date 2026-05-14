import React from "react";
import { createRoot } from "react-dom/client";
import { EasyJobPanel } from "../panel/PanelApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EasyJobPanel />
  </React.StrictMode>,
);
