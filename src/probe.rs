use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Deserialize)]
struct ProbeOutput { streams: Vec<StreamInfo>, format: FormatInfo }

#[derive(Debug, Deserialize)]
struct StreamInfo {
    codec_type: String,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    #[serde(default)]
    r_frame_rate: Option<String>,
    bit_rate: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FormatInfo { duration: Option<String>, size: Option<String>, bit_rate: Option<String> }

#[derive(Debug, Clone)]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration_secs: f64,
    pub size_bytes: u64,
    pub bitrate_bps: u64,
    pub video_codec: String,
    pub has_audio: bool,
}

pub fn probe(path: &Path) -> Result<VideoInfo> {
    let output = Command::new("ffprobe")
        .args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams"])
        .arg(path)
        .output()
        .context("failed to run ffprobe — is ffmpeg/ffprobe installed?")?;

    if !output.status.success() {
        bail!("ffprobe failed on {}: {}", path.display(), String::from_utf8_lossy(&output.stderr));
    }

    let parsed: ProbeOutput = serde_json::from_slice(&output.stdout).context("failed to parse ffprobe JSON")?;

    let video_stream = parsed.streams.iter().find(|s| s.codec_type == "video")
        .context("no video stream found in input file")?;
    let has_audio = parsed.streams.iter().any(|s| s.codec_type == "audio");

    let fps = video_stream.r_frame_rate.as_deref().and_then(parse_fraction).unwrap_or(0.0);
    let duration_secs: f64 = parsed.format.duration.as_deref().and_then(|d| d.parse().ok()).unwrap_or(0.0);
    let size_bytes: u64 = parsed.format.size.as_deref().and_then(|d| d.parse().ok()).unwrap_or(0);
    let bitrate_bps: u64 = parsed.format.bit_rate.as_deref().or(video_stream.bit_rate.as_deref())
        .and_then(|d| d.parse().ok()).unwrap_or(0);

    Ok(VideoInfo {
        width: video_stream.width.unwrap_or(0),
        height: video_stream.height.unwrap_or(0),
        fps, duration_secs, size_bytes, bitrate_bps,
        video_codec: video_stream.codec_name.clone().unwrap_or_else(|| "unknown".into()),
        has_audio,
    })
}

fn parse_fraction(s: &str) -> Option<f64> {
    let mut parts = s.split('/');
    let num: f64 = parts.next()?.parse().ok()?;
    let den: f64 = parts.next()?.parse().ok()?;
    if den == 0.0 { None } else { Some(num / den) }
}