# Multi-stage build for Rust VidShrink server with FFmpeg
FROM rust:1-slim-bookworm AS builder
WORKDIR /usr/src/app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

# Final runtime image — must match builder's Debian version for glibc compatibility
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime dependencies: FFmpeg, FFprobe, OpenSSL runtime, and CA certificates
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy compiled binary from builder
COPY --from=builder /usr/src/app/target/release/vidshrink /app/vidshrink
RUN chmod +x /app/vidshrink

# Railway injects PORT at runtime — this is just a fallback default
ENV PORT=8080
EXPOSE 8080

# Use shell form so stderr (crash messages) appears in Railway deploy logs
CMD /app/vidshrink --server 2>&1
