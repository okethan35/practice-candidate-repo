import { createRoot } from "react-dom/client";
import { App } from "./App";
import { themeCss } from "./theme";
import "./styles.css";

const style = document.createElement("style");
style.textContent = themeCss();
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(<App />);
