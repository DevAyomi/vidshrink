use anyhow::{Context, Result};
use regex::Regex;
use std::path::Path;
use std::process::Command;

#[derive(Debug)]
pub struct QualityReport { pub psnr_avg_db: Option<f64>, pub ssim_avg: Option<f64> }

pub fn compare(original: &Path, compressed: &Path) -> Result<QualityReport> {
    let output = Command::new("ffmpeg")
        .arg("-i").arg(compressed)
        .arg("-i").arg(original)
        .arg("-lavfi").arg("[0:v][1:v]ssim;[0:v][1:v]psnr")
        .arg("-f").arg("null").arg("-")
        .output()
        .context("failed to run ffmpeg for quality comparison")?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let psnr_re = Regex::new(r"average:(inf|[\d.]+)").unwrap();
    let ssim_re = Regex::new(r"All:([\d.]+)").unwrap();

    let psnr_avg_db = psnr_re.captures_iter(&stderr).last().and_then(|c| {
        let v = &c[1];
        if v == "inf" { Some(f64::INFINITY) } else { v.parse().ok() }
    });
    let ssim_avg = ssim_re.captures_iter(&stderr).last().and_then(|c| c[1].parse().ok());

    Ok(QualityReport { psnr_avg_db, ssim_avg })
}

impl QualityReport {
    pub fn verdict(&self) -> &'static str {
        match (self.ssim_avg, self.psnr_avg_db) {
            (Some(ssim), _) if ssim >= 0.995 => "excellent — visually identical to source",
            (Some(ssim), _) if ssim >= 0.98 => "very good — visually lossless for practical purposes",
            (Some(ssim), _) if ssim >= 0.95 => "good — minor differences possible on close inspection",
            (Some(_), _) => "noticeable quality loss — consider a lower CRF",
            (None, Some(p)) if p.is_infinite() => "excellent — mathematically identical to source",
            _ => "quality metrics unavailable",
        }
    }
}