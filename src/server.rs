use crate::encode::{self, EncodeRequest};
use crate::preset::{Codec, Quality};
use crate::probe::{self, VideoInfo};
use anyhow::Result;
use deadpool_redis::{Config, Pool, Runtime};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use uuid::Uuid;

static PAGE_VIEWS: AtomicU64 = AtomicU64::new(1);
static VIDEOS_COMPRESSED: AtomicU64 = AtomicU64::new(0);

const STATS_FILE: &str = "vidshrink_stats.json";
const QUEUE_NAME: &str = "vidshrink:jobs";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum JobStatus {
    Queued,
    Processing { progress_pct: f32 },
    Completed { result: CompressResult },
    Failed { error: String },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CompressResult {
    pub compressed_url: String,
    pub original_size_bytes: u64,
    pub compressed_size_bytes: u64,
    pub reduction_pct: f64,
    pub duration_secs: f64,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct JobPayload {
    pub job_id: String,
    pub input_file_path: String,
    pub original_filename: String,
    pub codec: Codec,
    pub quality: Quality,
    pub custom_crf: Option<f32>,
    pub target_width: Option<u32>,
    pub target_height: Option<u32>,
    pub audio_bitrate: u32,
}

#[derive(Serialize, Deserialize, Debug)]
struct PersistentStats {
    page_views: u64,
    videos_compressed: u64,
}

fn load_persistent_stats() -> (u64, u64) {
    if let Ok(content) = std::fs::read_to_string(STATS_FILE) {
        if let Ok(stats) = serde_json::from_str::<PersistentStats>(&content) {
            return (stats.page_views, stats.videos_compressed);
        }
    }
    (1, 0)
}

fn save_persistent_stats(page_views: u64, videos_compressed: u64) {
    let stats = PersistentStats {
        page_views,
        videos_compressed,
    };
    if let Ok(json) = serde_json::to_string_pretty(&stats) {
        let _ = std::fs::write(STATS_FILE, json);
    }
}

pub struct AppState {
    pub redis_pool: Option<Pool>,
    pub concurrency_semaphore: Arc<Semaphore>,
}

#[derive(Serialize)]
pub struct JobSubmitResponse {
    pub success: bool,
    pub job_id: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct JobStatusResponse {
    pub job_id: String,
    pub status: JobStatus,
}

#[derive(Deserialize)]
pub struct AdminLoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AdminLoginResponse {
    pub success: bool,
    pub token: Option<String>,
    pub message: String,
}

#[derive(Serialize)]
pub struct StatsResponse {
    pub page_views: u64,
    pub videos_compressed: u64,
}

// In-memory fallback if Redis is not configured
use std::collections::HashMap;
use tokio::sync::RwLock;

type MemoryJobs = Arc<RwLock<HashMap<String, JobStatus>>>;
type MemoryQueue = Arc<tokio::sync::mpsc::UnboundedSender<JobPayload>>;

#[derive(Clone)]
pub struct AppContext {
    pub state: Arc<AppState>,
    pub memory_jobs: MemoryJobs,
    pub memory_queue_tx: Option<MemoryQueue>,
}

pub async fn start_server(port: u16) -> anyhow::Result<()> {
    let (initial_views, initial_compressed) = load_persistent_stats();
    PAGE_VIEWS.store(initial_views, Ordering::SeqCst);
    VIDEOS_COMPRESSED.store(initial_compressed, Ordering::SeqCst);

    let redis_url = std::env::var("REDIS_URL")
        .or_else(|_| std::env::var("REDISURL"))
        .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

    let pool = match Config::from_url(&redis_url).create_pool(Some(Runtime::Tokio1)) {
        Ok(p) => match p.get().await {
            Ok(_) => {
                println!("✅ Connected to Redis at {}", redis_url);
                Some(p)
            }
            Err(e) => {
                println!("⚠️ Could not connect to Redis ({}): {}", redis_url, e);
                println!("⚠️ Falling back to in-memory async job queue & status store.");
                None
            }
        },
        Err(e) => {
            println!("⚠️ Redis config error: {}. Falling back to in-memory queue.", e);
            None
        }
    };

    // Calculate core count for fixed-size worker concurrency pool
    let core_count = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(2);
    // Cap max workers to core count
    let max_concurrency = core_count.max(1);
    println!("⚙️ Initializing compression pool with max {} concurrent encodes (core count: {})", max_concurrency, core_count);

    let semaphore = Arc::new(Semaphore::new(max_concurrency));
    let state = Arc::new(AppState {
        redis_pool: pool,
        concurrency_semaphore: semaphore,
    });

    let memory_jobs: MemoryJobs = Arc::new(RwLock::new(HashMap::new()));
    let (mem_tx, mut mem_rx) = tokio::sync::mpsc::unbounded_channel::<JobPayload>();
    let memory_queue_tx = Some(Arc::new(mem_tx));

    let ctx = AppContext {
        state: state.clone(),
        memory_jobs: memory_jobs.clone(),
        memory_queue_tx,
    };

    // Spawn Background Workers
    let worker_ctx = ctx.clone();
    tokio::spawn(async move {
        start_worker_loop(worker_ctx, &mut mem_rx, max_concurrency).await;
    });

    use axum::extract::DefaultBodyLimit;
    use axum::routing::{get, post};
    use axum::Router;
    use tower_http::cors::CorsLayer;

    let cors = CorsLayer::permissive();

    let app = Router::new()
        .route("/", get(handle_health))
        .route("/health", get(handle_health))
        .route("/api/track-view", post(handle_track_view))
        .route("/api/stats", get(handle_get_stats))
        .route("/api/admin/login", post(handle_admin_login))
        .route("/api/compress", post(handle_compress))
        .route("/api/jobs/:job_id", get(handle_job_status))
        .route("/api/downloads/:filename", get(handle_download))
        .layer(DefaultBodyLimit::max(200 * 1024 * 1024)) // 200 MB max body limit
        .layer(cors)
        .with_state(ctx);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    println!("🚀 VidShrink Decoupled Server running at http://{}", addr);
    let _ = std::io::Write::flush(&mut std::io::stdout());

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn handle_track_view() -> impl axum::response::IntoResponse {
    let views = PAGE_VIEWS.fetch_add(1, Ordering::SeqCst) + 1;
    let compressed = VIDEOS_COMPRESSED.load(Ordering::SeqCst);
    save_persistent_stats(views, compressed);
    axum::Json(StatsResponse {
        page_views: views,
        videos_compressed: compressed,
    })
}

async fn handle_get_stats() -> impl axum::response::IntoResponse {
    let views = PAGE_VIEWS.load(Ordering::SeqCst);
    let compressed = VIDEOS_COMPRESSED.load(Ordering::SeqCst);
    axum::Json(StatsResponse {
        page_views: views,
        videos_compressed: compressed,
    })
}

async fn handle_admin_login(
    axum::Json(payload): axum::Json<AdminLoginRequest>,
) -> impl axum::response::IntoResponse {
    if payload.email == "admin@gmail.com" && payload.password == "password" {
        axum::Json(AdminLoginResponse {
            success: true,
            token: Some("vidshrink-admin-secret-token".into()),
            message: "Login successful".into(),
        })
    } else {
        axum::Json(AdminLoginResponse {
            success: false,
            token: None,
            message: "Invalid email or password".into(),
        })
    }
}

async fn set_job_status(ctx: &AppContext, job_id: &str, status: &JobStatus) {
    if let Some(pool) = &ctx.state.redis_pool {
        if let Ok(mut conn) = pool.get().await {
            if let Ok(json) = serde_json::to_string(status) {
                let key = format!("vidshrink:job:{}", job_id);
                let _: Result<(), _> = conn.set_ex(key, json, 86400).await;
                return;
            }
        }
    }
    let mut jobs = ctx.memory_jobs.write().await;
    jobs.insert(job_id.to_string(), status.clone());
}

async fn get_job_status(ctx: &AppContext, job_id: &str) -> Option<JobStatus> {
    if let Some(pool) = &ctx.state.redis_pool {
        if let Ok(mut conn) = pool.get().await {
            let key = format!("vidshrink:job:{}", job_id);
            if let Ok(json) = conn.get::<_, String>(key).await {
                if let Ok(status) = serde_json::from_str::<JobStatus>(&json) {
                    return Some(status);
                }
            }
        }
    }
    let jobs = ctx.memory_jobs.read().await;
    jobs.get(job_id).cloned()
}

async fn push_job(ctx: &AppContext, payload: &JobPayload) -> anyhow::Result<()> {
    set_job_status(ctx, &payload.job_id, &JobStatus::Queued).await;

    if let Some(pool) = &ctx.state.redis_pool {
        if let Ok(mut conn) = pool.get().await {
            let json = serde_json::to_string(payload)?;
            let _: () = conn.rpush(QUEUE_NAME, json).await?;
            return Ok(());
        }
    }

    if let Some(tx) = &ctx.memory_queue_tx {
        tx.send(payload.clone())?;
    }
    Ok(())
}

async fn handle_compress(
    axum::extract::State(ctx): axum::extract::State<AppContext>,
    mut multipart: axum::extract::Multipart,
) -> axum::response::Response {
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    let job_id = Uuid::new_v4().to_string();
    let temp_dir = std::env::temp_dir();
    let temp_input_filename = format!("vidshrink_in_{}.tmp", job_id);
    let input_path = temp_dir.join(&temp_input_filename);

    let mut file_name = "video.mp4".to_string();
    let mut codec_str = "h265".to_string();
    let mut quality_str = "balanced".to_string();
    let mut custom_crf: Option<f32> = None;
    let mut target_w: Option<u32> = None;
    let mut target_h: Option<u32> = None;
    let mut audio_bitrate: u32 = 192;

    let mut file_writer: Option<File> = None;

    while let Ok(Some(mut field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            if let Some(filename) = field.file_name() {
                file_name = filename.to_string();
            }
            if file_writer.is_none() {
                match File::create(&input_path).await {
                    Ok(f) => file_writer = Some(f),
                    Err(e) => {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            format!("Failed to create stream file on disk: {e}"),
                        )
                            .into_response();
                    }
                }
            }
            let writer = file_writer.as_mut().unwrap();
            let mut total_bytes: u64 = 0;
            const MAX_FILE_SIZE_BYTES: u64 = 200 * 1024 * 1024; // 200 MB limit

            while let Ok(Some(chunk)) = field.chunk().await {
                total_bytes += chunk.len() as u64;
                if total_bytes > MAX_FILE_SIZE_BYTES {
                    let _ = tokio::fs::remove_file(&input_path).await;
                    return (
                        StatusCode::PAYLOAD_TOO_LARGE,
                        "File size exceeds maximum limit of 200MB",
                    )
                        .into_response();
                }
                if let Err(e) = writer.write_all(&chunk).await {
                    let _ = tokio::fs::remove_file(&input_path).await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Failed streaming chunk to disk: {e}"),
                    )
                        .into_response();
                }
            }
        } else {
            if let Ok(bytes) = field.bytes().await {
                if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                    match name.as_str() {
                        "codec" => codec_str = text,
                        "quality" => quality_str = text,
                        "crf" => {
                            if let Ok(val) = text.parse::<f32>() {
                                custom_crf = Some(val);
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

    if let Some(mut writer) = file_writer {
        let _ = writer.flush().await;
    } else {
        return (StatusCode::BAD_REQUEST, "No video file uploaded").into_response();
    }

    let codec = match codec_str.to_lowercase().as_str() {
        "h264" => Codec::H264,
        "av1" => Codec::Av1,
        _ => Codec::H265,
    };

    let quality = match quality_str.to_lowercase().as_str() {
        "visually-lossless" | "visuallylossless" => Quality::VisuallyLossless,
        "max-compression" | "maxcompression" => Quality::MaxCompression,
        _ => Quality::Balanced,
    };

    let payload = JobPayload {
        job_id: job_id.clone(),
        input_file_path: input_path.to_string_lossy().to_string(),
        original_filename: file_name,
        codec,
        quality,
        custom_crf,
        target_width: target_w,
        target_height: target_h,
        audio_bitrate,
    };

    if let Err(e) = push_job(&ctx, &payload).await {
        let _ = tokio::fs::remove_file(&input_path).await;
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to enqueue job: {e}"),
        )
            .into_response();
    }

    axum::Json(JobSubmitResponse {
        success: true,
        job_id,
        message: "Job accepted and queued for worker pool processing".into(),
    })
    .into_response()
}

async fn handle_job_status(
    axum::extract::State(ctx): axum::extract::State<AppContext>,
    axum::extract::Path(job_id): axum::extract::Path<String>,
) -> axum::response::Response {
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    if let Some(status) = get_job_status(&ctx, &job_id).await {
        axum::Json(JobStatusResponse { job_id, status }).into_response()
    } else {
        (StatusCode::NOT_FOUND, "Job ID not found").into_response()
    }
}

async fn start_worker_loop(
    ctx: AppContext,
    mem_rx: &mut tokio::sync::mpsc::UnboundedReceiver<JobPayload>,
    _concurrency: usize,
) {
    println!("👷 Worker pool process started, waiting for jobs...");

    loop {
        let mut job_opt: Option<JobPayload> = None;

        if let Some(pool) = &ctx.state.redis_pool {
            if let Ok(mut conn) = pool.get().await {
                // BLPOP timeout 2s
                let res: Result<Option<(String, String)>, _> = conn.blpop(QUEUE_NAME, 2.0).await;
                if let Ok(Some((_, json_data))) = res {
                    if let Ok(payload) = serde_json::from_str::<JobPayload>(&json_data) {
                        job_opt = Some(payload);
                    }
                }
            }
        }

        if job_opt.is_none() {
            // Check memory queue if redis did not yield a job
            if let Ok(payload) = mem_rx.try_recv() {
                job_opt = Some(payload);
            }
        }

        match job_opt {
            Some(payload) => {
                let ctx_clone = ctx.clone();
                let sem = ctx.state.concurrency_semaphore.clone();
                tokio::spawn(async move {
                    let _permit = sem.acquire().await.unwrap();
                    process_single_job(ctx_clone, payload).await;
                });
            }
            None => {
                tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
            }
        }
    }
}

async fn process_single_job(ctx: AppContext, payload: JobPayload) {
    println!("🚀 Starting processing job: {}", payload.job_id);

    set_job_status(
        &ctx,
        &payload.job_id,
        &JobStatus::Processing { progress_pct: 0.0 },
    )
    .await;

    let input_path = PathBuf::from(&payload.input_file_path);
    let temp_dir = std::env::temp_dir();
    let output_filename = format!("compressed_{}_{}", payload.job_id, payload.original_filename);
    let output_path = temp_dir.join(&output_filename);

    let source_info = match probe::probe(&input_path) {
        Ok(info) => info,
        Err(e) => {
            let _ = tokio::fs::remove_file(&input_path).await;
            set_job_status(
                &ctx,
                &payload.job_id,
                &JobStatus::Failed {
                    error: format!("Invalid video format probe error: {e}"),
                },
            )
            .await;
            return;
        }
    };

    let req = EncodeRequest {
        input: input_path.clone(),
        output: output_path.clone(),
        codec: payload.codec,
        quality: payload.quality,
        target_width: payload.target_width,
        target_height: payload.target_height,
        custom_crf: payload.custom_crf,
        copy_audio: false,
        audio_bitrate_kbps: payload.audio_bitrate,
        preserve_metadata: true,
    };

    let source_info_clone = source_info.clone();
    let encode_res = tokio::task::spawn_blocking(move || encode::run_encode(&req, &source_info_clone))
        .await
        .unwrap_or_else(|e| Err(anyhow::anyhow!("Spawn blocking join error: {e}")));

    let _ = tokio::fs::remove_file(&input_path).await;

    match encode_res {
        Ok(()) => {
            let output_info = probe::probe(&output_path).unwrap_or(VideoInfo {
                width: 1920,
                height: 1080,
                fps: 30.0,
                duration_secs: 0.0,
                size_bytes: 0,
                bitrate_bps: 0,
                video_codec: "unknown".into(),
                has_audio: false,
            });

            let orig_size = tokio::fs::metadata(&output_path)
                .await
                .map(|m| m.len())
                .unwrap_or(output_info.size_bytes);
            let original_size = if source_info.size_bytes > 0 {
                source_info.size_bytes
            } else {
                orig_size
            };

            let compressed_size =
                tokio::fs::metadata(&output_path).await.map(|m| m.len()).unwrap_or(1);
            let reduction_pct = 100.0 * (1.0 - (compressed_size as f64 / original_size.max(1) as f64));

            let comp_count = VIDEOS_COMPRESSED.fetch_add(1, Ordering::SeqCst) + 1;
            let view_count = PAGE_VIEWS.load(Ordering::SeqCst);
            save_persistent_stats(view_count, comp_count);

            let res = CompressResult {
                compressed_url: format!("/api/downloads/{}", output_filename),
                original_size_bytes: original_size,
                compressed_size_bytes: compressed_size,
                reduction_pct,
                duration_secs: source_info.duration_secs,
                width: output_info.width,
                height: output_info.height,
            };

            set_job_status(&ctx, &payload.job_id, &JobStatus::Completed { result: res }).await;
            println!("✅ Successfully completed job: {}", payload.job_id);
        }
        Err(e) => {
            let _ = tokio::fs::remove_file(&output_path).await;
            set_job_status(
                &ctx,
                &payload.job_id,
                &JobStatus::Failed {
                    error: format!("Encoding failed: {e}"),
                },
            )
            .await;
            println!("❌ Job failed: {}: {e}", payload.job_id);
        }
    }
}

async fn handle_download(axum::extract::Path(filename): axum::extract::Path<String>) -> axum::response::Response {
    use axum::http::{header, HeaderValue, StatusCode};
    use axum::response::IntoResponse;

    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(&filename);

    if !file_path.exists() {
        return (StatusCode::NOT_FOUND, "File not found").into_response();
    }

    match std::fs::read(&file_path) {
        Ok(data) => {
            let mut response = axum::response::Response::new(axum::body::Body::from(data));
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

async fn handle_health() -> impl axum::response::IntoResponse {
    #[derive(Serialize)]
    struct HealthStatus {
        status: &'static str,
        message: &'static str,
        architecture: &'static str,
    }
    (
        axum::http::StatusCode::OK,
        axum::Json(HealthStatus {
            status: "ok",
            message: "VidShrink Rust Decoupled API with Redis Queue is Online!",
            architecture: "Async Chunked Upload + Redis Queue Worker Pool",
        }),
    )
}
