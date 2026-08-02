use crate::preset::{ffmpeg_encoder_name, Codec, Quality};
use crate::probe::VideoInfo;
use anyhow::{bail, Context, Result};
use indicatif::{ProgressBar, ProgressStyle};
use regex::Regex;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

pub struct EncodeRequest<'a> {
    pub input: &'a Path,
    pub output: &'a Path,
    pub codec: Codec,
    pub quality: Quality,
    pub target_width: Option<u32>,
    pub target_height: Option<u32>,
    pub custom_crf: Option<f32>,
    pub copy_audio: bool,
    pub audio_bitrate_kbps: u32,
    pub preserve_metadata: bool,
}

pub fn run_encode(req: &EncodeRequest, source_info: &VideoInfo) -> Result<()> {
    let params = req.quality.params_for(req.codec);
    let encoder = ffmpeg_encoder_name(req.codec);
    let crf = req.custom_crf.unwrap_or(params.crf);

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y").arg("-i").arg(req.input)
        .arg("-c:v").arg(encoder)
        .arg("-crf").arg(crf.to_string())
        .arg("-preset").arg(params.speed_preset);

    if let (Some(w), Some(h)) = (req.target_width, req.target_height) {
        cmd.arg("-vf").arg(format!("scale={w}:{h}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"));
    }

    for a in &params.extra_args { cmd.arg(a); }

    // Fix macOS QuickTime & Safari HEVC/H.265 compatibility tag
    if req.codec == Codec::H265 {
        cmd.arg("-tag:v").arg("hvc1");
    }

    cmd.arg("-pix_fmt").arg("yuv420p");

    if !source_info.has_audio {
        cmd.arg("-an");
    } else if req.copy_audio {
        cmd.arg("-c:a").arg("copy");
    } else {
        cmd.arg("-c:a").arg("aac").arg("-b:a").arg(format!("{}k", req.audio_bitrate_kbps));
    }

    if req.preserve_metadata { cmd.arg("-map_metadata").arg("0"); }

    cmd.arg("-movflags").arg("+faststart");
    cmd.arg("-progress").arg("pipe:1").arg("-nostats").arg(req.output);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    println!("Encoding with {} | quality={} (CRF {}) | preset={}", req.codec, req.quality, crf, params.speed_preset);

    let mut child = cmd.spawn().context("failed to spawn ffmpeg")?;

    let pb = ProgressBar::new(source_info.duration_secs.max(1.0) as u64);
    pb.set_style(
        ProgressStyle::with_template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len}s ({eta})")
            .unwrap().progress_chars("#>-"),
    );

    let stderr = child.stderr.take().expect("stderr piped");
    let stderr_buf = Arc::new(Mutex::new(String::new()));
    let stderr_buf_thread = Arc::clone(&stderr_buf);
    let stderr_handle = thread::spawn(move || {
        let mut s = String::new();
        let mut reader = stderr;
        let _ = reader.read_to_string(&mut s);
        *stderr_buf_thread.lock().unwrap() = s;
    });

    let stdout = child.stdout.take().expect("stdout piped");
    let time_re = Regex::new(r"out_time_ms=(\d+)").unwrap();
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(|l| l.ok()) {
        if let Some(caps) = time_re.captures(&line) {
            if let Ok(us) = caps[1].parse::<u64>() {
                pb.set_position(us / 1_000_000);
            }
        }
    }

    let status = child.wait().context("failed waiting on ffmpeg")?;
    let _ = stderr_handle.join();
    pb.finish_and_clear();

    if !status.success() {
        let stderr_out = stderr_buf.lock().unwrap().clone();
        bail!("ffmpeg exited with an error:\n{stderr_out}");
    }

    Ok(())
}