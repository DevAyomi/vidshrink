mod encode;
mod preset;
mod probe;
mod quality;
mod server;

use anyhow::{ensure, Context, Result};
use clap::Parser;
use colored::Colorize;
use encode::EncodeRequest;
use preset::{Codec, Quality};
use std::path::PathBuf;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(name = "vidshrink", version, about)]
struct Args {
    input: Option<PathBuf>,
    #[arg(short, long)]
    output: Option<PathBuf>,
    #[arg(short, long, value_enum, default_value_t = Codec::H265)]
    codec: Codec,
    #[arg(short, long, value_enum, default_value_t = Quality::VisuallyLossless)]
    quality: Quality,
    #[arg(long)]
    reencode_audio: bool,
    #[arg(long, default_value_t = 192)]
    audio_bitrate: u32,
    #[arg(long)]
    skip_verify: bool,
    #[arg(long)]
    server: bool,
    #[arg(long, default_value_t = 8080)]
    port: u16,
}

fn human_bytes(bytes: u64) -> String {
    let mb = bytes as f64 / 1_000_000.0;
    if mb >= 1000.0 { format!("{:.2} GB", mb / 1000.0) } else { format!("{:.1} MB", mb) }
}

fn check_tool_available(name: &str) -> Result<()> {
    std::process::Command::new(name).arg("-version")
        .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
        .status()
        .with_context(|| format!("`{name}` not found on PATH — install ffmpeg first"))?;
    Ok(())
}

fn main() -> Result<()> {
    let args = Args::parse();
    check_tool_available("ffmpeg")?;
    check_tool_available("ffprobe")?;

    // If server mode or no input file specified, run HTTP API server
    if args.server || args.input.is_none() {
        let env_port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok());
        let port = env_port.unwrap_or(args.port);
        let rt = tokio::runtime::Runtime::new()?;
        return rt.block_on(async {
            if let Some(p) = env_port {
                if p != 8080 {
                    tokio::spawn(async move {
                        println!("🚀 Binding secondary listener on port 8080");
                        let _ = server::start_server(8080).await;
                    });
                }
            }
            server::start_server(port).await
        });
    }

    let input_path = args.input.unwrap();
    ensure!(input_path.exists(), "input file not found: {}", input_path.display());

    let output = args.output.clone().unwrap_or_else(|| {
        let stem = input_path.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        input_path.with_file_name(format!("{stem}.compressed.mp4"))
    });

    println!("{}", "── vidshrink ──".bold());
    println!("Source:  {}", input_path.display());
    println!("Target:  {}", output.display());

    let source_info = probe::probe(&input_path)?;
    println!("Input:   {}x{} @ {:.2}fps, {}, source codec {}",
        source_info.width, source_info.height, source_info.fps,
        human_bytes(source_info.size_bytes), source_info.video_codec);

    let req = EncodeRequest {
        input: &input_path,
        output: &output,
        codec: args.codec,
        quality: args.quality,
        target_width: None,
        target_height: None,
        custom_crf: None,
        copy_audio: !args.reencode_audio && source_info.has_audio,
        audio_bitrate_kbps: args.audio_bitrate,
        preserve_metadata: true,
    };

    let start = Instant::now();
    encode::run_encode(&req, &source_info)?;
    let elapsed = start.elapsed();

    let output_info = probe::probe(&output)?;
    let pct_change = 100.0 * (1.0 - output_info.size_bytes as f64 / source_info.size_bytes.max(1) as f64);

    println!();
    println!("{}", "── Result ──".bold());
    println!("Size:    {} -> {} ({}{:.1}%)", human_bytes(source_info.size_bytes),
        human_bytes(output_info.size_bytes), if pct_change >= 0.0 { "-" } else { "+" }, pct_change.abs());
    println!("Time:    {:.1}s", elapsed.as_secs_f64());

    if !args.skip_verify {
        println!("Verifying quality (PSNR/SSIM against source)...");
        let report = quality::compare(&input_path, &output)?;
        if let Some(ssim) = report.ssim_avg { println!("SSIM:    {:.4}", ssim); }
        if let Some(psnr) = report.psnr_avg_db {
            if psnr.is_finite() { println!("PSNR:    {:.2} dB", psnr); } else { println!("PSNR:    infinite (lossless)"); }
        }
        println!("Verdict: {}", report.verdict().green());
    }

    Ok(())
}