import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ACBTracker from "./ACBTracker.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ACBTracker />
  </StrictMode>
);
