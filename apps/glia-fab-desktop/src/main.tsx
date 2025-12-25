import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ShellApp } from "./shell";
import "./styles.css";
import "./poc/viewportPocBridge";

const root = import.meta.env.VITE_SHELL === "1" ? <ShellApp /> : <App />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {root}
  </React.StrictMode>
);
