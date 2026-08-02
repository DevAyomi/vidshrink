# 🎬 VidShrink

> **High-Performance Video Compression Engine & Web Suite powered by Rust, Axum, FFmpeg, and React.**

VidShrink is a ultra-fast, modern video compression utility and full-stack web application. It combines a robust **Rust CLI** and **Axum HTTP API** backed by hardware-accelerated **FFmpeg** with a visually sleek **React (Vite + TypeScript)** user interface featuring real-time visual comparisons and custom compression presets.

---

## ✨ Features

- ⚡ **Blazing Fast Compression**: Optimized Rust backend with customizable CRF quality presets (Visually Lossless, Balanced, Maximum Compression).
- 🎞️ **Multi-Codec Support**: Full support for H.264 (AVC), H.265 (HEVC), and AV1 encoding.
- 🎛️ **Dual-Mode Operation**:
  - **CLI Mode**: Batch encode, probe video metadata, compute PSNR/SSIM quality metrics.
  - **Server Mode**: High-performance Axum REST API supporting multi-gigabyte video uploads.
- 🎨 **Modern Split-Screen Web GUI**:
  - Real-time side-by-side video player comparison slider.
  - Resolution scaling (4K, 1080p, 720p, 480p, and custom defaults).
  - Audio bitrate adjustment & custom codec selection.
- 🐳 **Cloud-Ready Docker Setup**: Pre-configured multi-stage `Dockerfile` with embedded FFmpeg for instant deployment on Railway or Docker containers.

---

## 🛠️ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Backend Core** | Rust 2021, Axum 0.7, Tokio, Clap CLI |
| **Media Processing** | FFmpeg runtime, FFprobe |
| **Frontend** | React 19, Vite 8, TypeScript 6, Lucide Icons, CSS3 |
| **Deployment** | Docker (Railway) + Vercel |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) (1.80+)
- [FFmpeg](https://ffmpeg.org/download.html) & `ffprobe` installed and added to your system `PATH`
- [Node.js](https://nodejs.org/) (v18+)

### 1. CLI Usage
Compress a video directly from your terminal:

```bash
# Basic compression (H.265 Visually Lossless default)
cargo run --release -- input.mp4 -o output.compressed.mp4

# Advanced options (AV1 codec at 720p with re-encoded audio)
cargo run --release -- input.mp4 -c av1 -q balanced --reencode-audio --audio-bitrate 128
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

Build and run the entire backend server in a Docker container (includes FFmpeg automatically):

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
