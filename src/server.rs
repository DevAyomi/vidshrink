use crate::encode::{self, EncodeRequest};
use crate::preset::{Codec, Quality};
use crate::probe;
use axum::{
  extract::{DefaultBodyLimit, Multipart, Path},
  http::{header, HeaderValue, StatusCode},
  response::{IntoResponse, Json, Response},
  routing::{get, post},
  Router,
};
use serde::Serialize;
use std::io::Write;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use tower_http::cors::CorsLayer;

static COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize)]
pub struct CompressResponse {
  pub success: bool,
  pub compressed_url: String,
  pub original_size_bytes: u64,
  pub compressed_size_bytes: u64,
  pub reduction_pct: f64,
  pub duration_secs: f64,
  pub width: u32,
  pub height: u32,
}

pub async fn start_server(port: u16) -> anyhow::Result<()> {
  let cors = CorsLayer::permissive();

  let app = Router::new()
    .route("/", get(handle_health))
    .route("/health", get(handle_health))
    .route("/api/compress", post(handle_compress))
    .route("/api/downloads/:filename", get(handle_download))
    .layer(DefaultBodyLimit::max(5 * 1024 * 1024 * 1024)) // 5 GB body limit for video uploads!
    .layer(cors);

  let addr = SocketAddr::from(([0, 0, 0, 0], port));
  println!("🚀 VidShrink Rust Server running at http://{}", addr);
  let _ = std::io::stdout().flush();

  let listener = tokio::net::TcpListener::bind(addr).await?;
  axum::serve(listener, app).await?;
  Ok(())
}

async fn handle_compress(mut multipart: Multipart) -> Response {
  let mut file_bytes: Option<Vec<u8>> = None;
  let mut file_name: String = "upload.mp4".into();
  let mut codec_str: String = "h265".into();
  let mut compression_pct: f32 = 36.0;
  let mut target_w: Option<u32> = Some(1080);
  let mut target_h: Option<u32> = Some(960);
  let mut audio_bitrate: u32 = 192;

  while let Ok(Some(field)) = multipart.next_field().await {
    let name = field.name().unwrap_or("").to_string();
    if name == "file" {
      if let Some(filename) = field.file_name() {
        file_name = filename.to_string();
      }
      match field.bytes().await {
        Ok(bytes) => {
          file_bytes = Some(bytes.to_vec());
        }
        Err(e) => {
          return (
            StatusCode::BAD_REQUEST,
            format!("Error reading video bytes: {e}"),
          )
            .into_response();
        }
      }
    } else {
      if let Ok(bytes) = field.bytes().await {
        if let Ok(text) = String::from_utf8(bytes.to_vec()) {
          match name.as_str() {
            "codec" => codec_str = text,
            "compressionPct" => {
              if let Ok(val) = text.parse::<f32>() {
                compression_pct = val;
              }
            }
            "width" => {
              if let Ok(val) = text.parse::<u32>() {
                target_w = Some(val);
              }
            }
            "height" => {
              if let Ok(val) = text.parse::<u32>() {
                target_h = Some(val);
              }
            }
            "audioBitrate" => {
              if let Ok(val) = text.parse::<u32>() {
                audio_bitrate = val;
              }
            }
            _ => {}
          }
        }
      }
    }
  }

  let bytes = match file_bytes {
    Some(b) => b,
    None => {
      return (StatusCode::BAD_REQUEST, "No video file provided").into_response();
    }
  };

  let id = COUNTER.fetch_add(1, Ordering::SeqCst);
  let temp_dir = std::env::temp_dir();
  let input_path = temp_dir.join(format!("vidshrink_in_{}_{}", id, file_name));
  let output_filename = format!("compressed_{}_{}", id, file_name);
  let output_path = temp_dir.join(&output_filename);

  if let Err(e) = std::fs::write(&input_path, &bytes) {
    return (
      StatusCode::INTERNAL_SERVER_ERROR,
      format!("Failed saving input file: {e}"),
    )
      .into_response();
  }

  let source_info = match probe::probe(&input_path) {
    Ok(info) => info,
    Err(e) => {
      let _ = std::fs::remove_file(&input_path);
      return (
        StatusCode::BAD_REQUEST,
        format!("Invalid video file probe error: {e}"),
      )
        .into_response();
    }
  };

  let codec = match codec_str.as_str() {
    "h264" => Codec::H264,
    "av1" => Codec::Av1,
    _ => Codec::H265,
  };

  let crf = match codec {
    Codec::H264 => 18.0 + (compression_pct / 100.0) * 18.0,
    Codec::H265 => 18.0 + (compression_pct / 100.0) * 16.0,
    Codec::Av1 => 24.0 + (compression_pct / 100.0) * 18.0,
  };

  let req = EncodeRequest {
    input: &input_path,
    output: &output_path,
    codec,
    quality: Quality::Balanced,
    target_width: target_w,
    target_height: target_h,
    custom_crf: Some(crf),
    copy_audio: false,
    audio_bitrate_kbps: audio_bitrate,
    preserve_metadata: true,
  };

  if let Err(e) = encode::run_encode(&req, &source_info) {
    let _ = std::fs::remove_file(&input_path);
    let _ = std::fs::remove_file(&output_path);
    return (
      StatusCode::INTERNAL_SERVER_ERROR,
      format!("Encoding failed: {e}"),
    )
      .into_response();
  }

  let output_info = probe::probe(&output_path).unwrap_or(source_info.clone());
  let original_size = source_info.size_bytes;
  let compressed_size = output_info.size_bytes;
  let reduction_pct =
    100.0 * (1.0 - (compressed_size as f64 / original_size.max(1) as f64));

  let _ = std::fs::remove_file(&input_path);

  let resp = CompressResponse {
    success: true,
    compressed_url: format!("/api/downloads/{}", output_filename),
    original_size_bytes: original_size,
    compressed_size_bytes: compressed_size,
    reduction_pct,
    duration_secs: source_info.duration_secs,
    width: output_info.width,
    height: output_info.height,
  };

  Json(resp).into_response()
}

async fn handle_download(Path(filename): Path<String>) -> Response {
  let temp_dir = std::env::temp_dir();
  let file_path = temp_dir.join(&filename);

  if !file_path.exists() {
    return (StatusCode::NOT_FOUND, "File not found").into_response();
  }

  match std::fs::read(&file_path) {
    Ok(data) => {
      let mut response = Response::new(axum::body::Body::from(data));
      response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("video/mp4"),
      );
      response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename)).unwrap(),
      );
      response
    }
    Err(e) => (
      StatusCode::INTERNAL_SERVER_ERROR,
      format!("File read error: {e}"),
    )
      .into_response(),
  }
}

async fn handle_health() -> impl IntoResponse {
  #[derive(Serialize)]
  struct HealthStatus {
    status: &'static str,
    message: &'static str,
  }
  (
    StatusCode::OK,
    Json(HealthStatus {
      status: "ok",
      message: "VidShrink Rust Engine API is Online!",
    }),
  )
}
