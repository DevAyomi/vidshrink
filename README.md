# 🎬 VidShrink

> **High-Performance Video Compressor & Universal Image Format Converter powered by Rust, Axum, FFmpeg, resvg, and React.**

VidShrink is an ultra-fast, modern media processing suite and full-stack web application. It delivers hardware-accelerated **Video Compression** (H.264, H.265, AV1) and **Universal Image Format Conversion** (JPG, PNG, WEBP, SVG, AVIF, ICO, GIF, BMP, TIFF) through a robust **Rust CLI / Axum HTTP API** and a sleek **React (Vite + TypeScript)** user interface with real-time interactive Before & After visual comparison sliders.

---

## ✨ Features

### 🎬 Video Compression
- ⚡ **Blazing Fast Encoding**: Optimized Rust backend with customizable CRF quality presets (*Visually Lossless*, *Balanced*, *Maximum Compression*).
- 🎞️ **Multi-Codec Support**: Full support for **H.265 / HEVC**, **H.264 / AVC**, and next-gen **AV1** encoding.
- 📐 **Resolution Scaling**: 4K UHD, 1080p Full HD, 720p HD, 480p SD, and custom dimensions with automatic aspect-ratio preservation.
- 🔊 **Audio Tuning**: Bitrate adjustment (128k, 192k, 320k) and pass-through/re-encoding.

### 🖼️ Universal Image Format Converter
- 🔄 **Any Format to Any Format**: Convert seamlessly between **PNG, JPG / JPEG, WEBP, SVG, AVIF, ICO, GIF, BMP, and TIFF**.
- 🎨 **Vector SVG Rasterization**: High-precision vector rendering powered by `resvg` & `usvg` with system font support.
- 🚀 **Native WebP Engine**: Direct in-memory WebP encoding for ultra-fast conversion speeds.
- 🎚️ **Quality & Scale Presets**: Quality slider ($1\%-100\%$) and scale shortcuts ($100\%, 75\%, 50\%, 25\%$ or custom Width $\times$ Height).
- 🪄 **Alpha Blending**: Transparent PNG and RGBA graphics automatically blend onto clean backgrounds when converted to non-alpha formats.

### 🎛️ Dual-Mode Architecture
- **CLI Mode**: Direct terminal commands for video encoding and image conversion with automatic format detection.
- **Web App & Decoupled API**: Responsive React GUI with interactive Before/After split-view sliders, persistent Redis counters, and chunked streaming uploads.

---

## 🛠️ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Backend Core** | Rust 2021, Axum 0.7, Tokio, Clap CLI |
| **Video Engine** | FFmpeg, FFprobe |
| **Image Engine** | Rust `image`, `webp`, `resvg`, `tiny-skia` |
| **Queue & Cache** | Redis / Deadpool-Redis (Persistent Stats & Worker Queue) |
| **Frontend** | React 19, Vite 8, TypeScript, Lucide Icons, CSS3 |
| **Deployment** | Docker (Railway) + Vercel |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) (1.80+)
- [FFmpeg](https://ffmpeg.org/download.html) & `ffprobe` installed and added to your system `PATH`
- [Node.js](https://nodejs.org/) (v18+)

### 1. CLI Usage

**Compress a Video:**
```bash
# Basic compression (H.265 Visually Lossless default)
cargo run --release -- input.mp4 -o output.compressed.mp4

# Advanced options (AV1 codec at 720p with re-encoded audio)
cargo run --release -- input.mp4 -c av1 -q balanced --reencode-audio --audio-bitrate 128
```

**Convert an Image:**
```bash
# Convert SVG to PNG
cargo run --release -- logo.svg -o logo.png

# Convert JPG to WEBP with custom quality
cargo run --release -- photo.jpg --format webp --image-quality 90
```

### 2. Run Web App Locally

**Start Rust API Server:**
```bash
cargo run --release -- --server --port 8080
```

**Start React Frontend:**
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173` in your browser.

---

## 🐳 Docker

Build and run the entire backend server in a Docker container:

```bash
docker build -t vidshrink .
docker run -p 8080:8080 -e PORT=8080 vidshrink
```

---

## 🌐 Deployment

- **Backend (Railway)**: Deploy using the included [`Dockerfile`](./Dockerfile). Automatically binds to `$PORT` and `0.0.0.0`.
- **Frontend (Vercel)**: Deploy `./frontend` directory as a Vite project with environment variable `VITE_API_URL` pointing to your Railway backend URL.

---

## 📄 License

MIT License © 2026
