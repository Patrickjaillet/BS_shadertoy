# Babylon.js Shadertoy

A real-time GLSL shader playground built with **Babylon.js**, running entirely in the browser. Write fragment shaders, tweak uniforms live, and preview the result instantly — no build step, no backend, just a single HTML file.

![Babylon.js Shadertoy screenshot](./docs/screenshot.jpg)

## ✨ Features

- **Live GLSL editor** powered by CodeMirror, with syntax highlighting and an auto-compile mode (compiles on the fly as you type, with a short debounce).
- **Realtime canvas preview** rendered with Babylon.js, wrapped in a decorative gold frame.
- **Uniforms monitor** — watch `iResolution`, `iMouse` and `iFrame` update live as you interact with the canvas.
- **Parameter inspector** with a filter/search box to quickly find and tweak custom shader parameters.
- **Presets** — switch between built-in shader examples (Default, Warp Speed, Calm Ambient).
- **Playback controls** — play/pause the render loop and reset the elapsed time.
- **Screenshot capture** of the current render, directly from the toolbar.
- **Fullscreen mode** for a distraction-free preview.
- **Copy / paste** shader code to and from the clipboard.
- **Error console** that surfaces GLSL compiler errors inline, without leaving the page.
- **FPS / time / resolution HUD** in the header for quick performance feedback.

## 🚀 Getting Started

No installation or build tools required.

1. Clone or download this repository.
2. Open `docs/index.html` in a modern desktop browser (Chrome, Edge, or Firefox recommended).
3. Start editing the GLSL code in the editor panel — the preview updates automatically when **Auto-compile** is enabled, or click **Compile** to run it manually.

> Everything (Babylon.js, Tailwind CSS, CodeMirror, Font Awesome) is loaded from CDNs, so an internet connection is required the first time the page loads.

You can also try it directly online via GitHub Pages: **[patrickjaillet.github.io/bs](https://patrickjaillet.github.io/bs)**

## 🛠️ Tech Stack

- [Babylon.js](https://www.babylonjs.com/) — WebGL rendering engine
- [CodeMirror](https://codemirror.net/5/) — in-browser code editor
- [Tailwind CSS](https://tailwindcss.com/) — utility-first styling
- [Font Awesome](https://fontawesome.com/) — icons

## 📄 License

This project is licensed under a proprietary license — all rights reserved. See [LICENSE](./LICENSE) for details.

## 📬 Contact

**Patrick JAILLET**
Email: [sandefjord.development@proton.me](mailto:sandefjord.development@proton.me)
Website: [https://patrickjaillet.github.io/bs](https://patrickjaillet.github.io/bs)
