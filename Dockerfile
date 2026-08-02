# Multi-stage build for Rust VidShrink server with FFmpeg
FROM rust:1-slim AS builder
WORKDIR /usr/src/app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

# Final runtime image
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime dependencies: FFmpeg, FFprobe, and CA certificates
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy compiled binary from builder
COPY --from=builder /usr/src/app/target/release/vidshrink /app/vidshrink

EXPOSE 8080

CMD ["/app/vidshrink", "--server"]
