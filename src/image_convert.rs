use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormatType {
    Png,
    Jpg,
    Jpeg,
    Webp,
    Gif,
    Bmp,
    Tiff,
    Ico,
    Avif,
    Svg,
}

impl ImageFormatType {
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpg | Self::Jpeg => "jpg",
            Self::Webp => "webp",
            Self::Gif => "gif",
            Self::Bmp => "bmp",
            Self::Tiff => "tiff",
            Self::Ico => "ico",
            Self::Avif => "avif",
            Self::Svg => "svg",
        }
    }

    pub fn mime_type(&self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpg | Self::Jpeg => "image/jpeg",
            Self::Webp => "image/webp",
            Self::Gif => "image/gif",
            Self::Bmp => "image/bmp",
            Self::Tiff => "image/tiff",
            Self::Ico => "image/x-icon",
            Self::Avif => "image/avif",
            Self::Svg => "image/svg+xml",
        }
    }

    pub fn from_str_lenient(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "png" => Self::Png,
            "jpg" | "jpeg" => Self::Jpg,
            "webp" => Self::Webp,
            "gif" => Self::Gif,
            "bmp" => Self::Bmp,
            "tiff" | "tif" => Self::Tiff,
            "ico" => Self::Ico,
            "avif" => Self::Avif,
            "svg" => Self::Svg,
            _ => Self::Png,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageConvertRequest {
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub target_format: ImageFormatType,
    pub quality: Option<u8>, // 1 - 100
    pub target_width: Option<u32>,
    pub target_height: Option<u32>,
    pub keep_aspect_ratio: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMeta {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size_bytes: u64,
}

fn is_svg_data(data: &[u8], path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("svg") {
            return true;
        }
    }
    data.starts_with(b"<?xml")
        || data.starts_with(b"<svg")
        || std::str::from_utf8(&data[..data.len().min(512)])
            .map(|s| s.contains("<svg"))
            .unwrap_or(false)
}

fn render_svg_to_image(
    svg_data: &[u8],
    target_width: Option<u32>,
    target_height: Option<u32>,
) -> Result<image::DynamicImage> {
    let mut opt = resvg::usvg::Options::default();
    opt.fontdb_mut().load_system_fonts();

    let tree = resvg::usvg::Tree::from_data(svg_data, &opt)
        .context("Failed parsing SVG markup")?;

    let size = tree.size();
    let orig_w = size.width();
    let orig_h = size.height();

    let (out_w, out_h, transform) = if let (Some(w), Some(h)) = (target_width, target_height) {
        if w > 0 && h > 0 {
            let sx = w as f32 / orig_w;
            let sy = h as f32 / orig_h;
            (w, h, resvg::tiny_skia::Transform::from_scale(sx, sy))
        } else {
            (
                orig_w.ceil().max(1.0) as u32,
                orig_h.ceil().max(1.0) as u32,
                resvg::tiny_skia::Transform::default(),
            )
        }
    } else if let Some(w) = target_width {
        if w > 0 {
            let s = w as f32 / orig_w;
            let h = (orig_h * s).round().max(1.0) as u32;
            (w, h, resvg::tiny_skia::Transform::from_scale(s, s))
        } else {
            (
                orig_w.ceil().max(1.0) as u32,
                orig_h.ceil().max(1.0) as u32,
                resvg::tiny_skia::Transform::default(),
            )
        }
    } else if let Some(h) = target_height {
        if h > 0 {
            let s = h as f32 / orig_h;
            let w = (orig_w * s).round().max(1.0) as u32;
            (w, h, resvg::tiny_skia::Transform::from_scale(s, s))
        } else {
            (
                orig_w.ceil().max(1.0) as u32,
                orig_h.ceil().max(1.0) as u32,
                resvg::tiny_skia::Transform::default(),
            )
        }
    } else {
        (
            orig_w.ceil().max(1.0) as u32,
            orig_h.ceil().max(1.0) as u32,
            resvg::tiny_skia::Transform::default(),
        )
    };

    let mut pixmap = resvg::tiny_skia::Pixmap::new(out_w, out_h)
        .ok_or_else(|| anyhow::anyhow!("Failed creating pixmap buffer of {out_w}x{out_h}"))?;

    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let rgba = image::RgbaImage::from_raw(out_w, out_h, pixmap.take())
        .ok_or_else(|| anyhow::anyhow!("Failed converting pixmap to RgbaImage"))?;

    Ok(image::DynamicImage::ImageRgba8(rgba))
}

pub fn probe_image(path: &Path) -> Result<ImageMeta> {
    let size_bytes = std::fs::metadata(path)
        .map(|m| m.len())
        .unwrap_or(0);

    // If SVG file or contains SVG markup
    if let Ok(data) = std::fs::read(path) {
        if is_svg_data(&data, path) {
            let opt = resvg::usvg::Options::default();
            if let Ok(tree) = resvg::usvg::Tree::from_data(&data, &opt) {
                let size = tree.size();
                return Ok(ImageMeta {
                    width: size.width().ceil() as u32,
                    height: size.height().ceil() as u32,
                    format: "SVG".into(),
                    size_bytes,
                });
            }
        }
    }

    // Try reading dimensions using image crate
    if let Ok(reader) = image::io::Reader::open(path) {
        if let Ok(reader_with_format) = reader.with_guessed_format() {
            let format_name = reader_with_format
                .format()
                .map(|f| format!("{:?}", f))
                .unwrap_or_else(|| "Unknown".into());

            if let Ok((width, height)) = reader_with_format.into_dimensions() {
                return Ok(ImageMeta {
                    width,
                    height,
                    format: format_name,
                    size_bytes,
                });
            }
        }
    }

    // Fallback to ffprobe
    let output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,codec_name",
            "-of", "json",
        ])
        .arg(path)
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let json_str = String::from_utf8_lossy(&out.stdout);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(stream) = v["streams"].as_array().and_then(|s| s.first()) {
                    let width = stream["width"].as_u64().unwrap_or(0) as u32;
                    let height = stream["height"].as_u64().unwrap_or(0) as u32;
                    let codec = stream["codec_name"].as_str().unwrap_or("unknown").to_string();
                    if width > 0 && height > 0 {
                        return Ok(ImageMeta {
                            width,
                            height,
                            format: codec,
                            size_bytes,
                        });
                    }
                }
            }
        }
    }

    Ok(ImageMeta {
        width: 0,
        height: 0,
        format: "unknown".into(),
        size_bytes,
    })
}

pub fn convert_image(req: &ImageConvertRequest) -> Result<()> {
    // If output dir doesn't exist, create it
    if let Some(parent) = req.output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Strategy 1: Pure Rust image crate & resvg processing
    let err1 = match convert_with_image_crate(req) {
        Ok(()) => return Ok(()),
        Err(e) => e,
    };

    // Strategy 2: Universal FFmpeg conversion fallback
    let err2 = match convert_with_ffmpeg(req) {
        Ok(()) => return Ok(()),
        Err(e) => e,
    };

    anyhow::bail!(
        "Failed converting image {:?} to {:?}. Rust image error: {}. FFmpeg error: {}",
        req.input_path,
        req.output_path,
        err1,
        err2
    );
}

fn convert_with_image_crate(req: &ImageConvertRequest) -> Result<()> {
    let data = std::fs::read(&req.input_path).context("Failed reading input image file")?;

    let mut img = if is_svg_data(&data, &req.input_path) {
        render_svg_to_image(&data, req.target_width, req.target_height)?
    } else {
        let reader = image::io::Reader::open(&req.input_path)
            .context("Failed to open input image file")?
            .with_guessed_format()
            .context("Failed to determine image format from file contents")?;

        reader.decode().context("Failed to decode image contents")?
    };

    // Handle resizing if requested
    if let (Some(w), Some(h)) = (req.target_width, req.target_height) {
        if w > 0 && h > 0 {
            if req.keep_aspect_ratio {
                img = img.resize(w, h, image::imageops::FilterType::Lanczos3);
            } else {
                img = img.resize_exact(w, h, image::imageops::FilterType::Lanczos3);
            }
        }
    } else if let Some(w) = req.target_width {
        if w > 0 {
            let aspect = img.height() as f32 / img.width() as f32;
            let h = (w as f32 * aspect).round() as u32;
            img = img.resize_exact(w, h.max(1), image::imageops::FilterType::Lanczos3);
        }
    } else if let Some(h) = req.target_height {
        if h > 0 {
            let aspect = img.width() as f32 / img.height() as f32;
            let w = (h as f32 * aspect).round() as u32;
            img = img.resize_exact(w.max(1), h, image::imageops::FilterType::Lanczos3);
        }
    }

    let quality = req.quality.unwrap_or(85);

    match req.target_format {
        ImageFormatType::Png => {
            img.save_with_format(&req.output_path, image::ImageFormat::Png)?;
        }
        ImageFormatType::Jpg | ImageFormatType::Jpeg => {
            // Handle transparent images gracefully by blending alpha onto clean white background
            let rgb = if img.color().has_alpha() {
                let rgba = img.to_rgba8();
                let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
                for (x, y, pixel) in rgba.enumerate_pixels() {
                    let [r, g, b, a] = pixel.0;
                    let alpha = a as f32 / 255.0;
                    let r_out = ((r as f32 * alpha) + (255.0 * (1.0 - alpha))).round() as u8;
                    let g_out = ((g as f32 * alpha) + (255.0 * (1.0 - alpha))).round() as u8;
                    let b_out = ((b as f32 * alpha) + (255.0 * (1.0 - alpha))).round() as u8;
                    rgb.put_pixel(x, y, image::Rgb([r_out, g_out, b_out]));
                }
                rgb
            } else {
                img.to_rgb8()
            };

            let mut file = std::fs::File::create(&req.output_path)?;
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, quality);
            encoder.encode(
                &rgb,
                rgb.width(),
                rgb.height(),
                image::ColorType::Rgb8,
            )?;
        }
        ImageFormatType::Bmp => {
            img.save_with_format(&req.output_path, image::ImageFormat::Bmp)?;
        }
        ImageFormatType::Ico => {
            // For ICO format, ensure maximum dimensions 256x256
            let ico_img = if img.width() > 256 || img.height() > 256 {
                img.resize(256, 256, image::imageops::FilterType::Lanczos3)
            } else {
                img
            };
            ico_img.save_with_format(&req.output_path, image::ImageFormat::Ico)?;
        }
        ImageFormatType::Tiff => {
            img.save_with_format(&req.output_path, image::ImageFormat::Tiff)?;
        }
        ImageFormatType::Gif => {
            img.save_with_format(&req.output_path, image::ImageFormat::Gif)?;
        }
        ImageFormatType::Webp => {
            let rgba = img.to_rgba8();
            let encoder = webp::Encoder::from_rgba(&rgba, rgba.width(), rgba.height());
            let memory = encoder.encode(quality as f32);
            std::fs::write(&req.output_path, &*memory)?;
        }
        ImageFormatType::Avif | ImageFormatType::Svg => {
            // Forward to FFmpeg for highest quality encoding
            anyhow::bail!("Forwarding {:?} conversion to FFmpeg", req.target_format);
        }
    }

    Ok(())
}

fn convert_with_ffmpeg(req: &ImageConvertRequest) -> Result<()> {
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y"); // overwrite output
    cmd.arg("-i").arg(&req.input_path);

    // Scaling filter
    let scale_filter = if let (Some(w), Some(h)) = (req.target_width, req.target_height) {
        if w > 0 && h > 0 {
            if req.keep_aspect_ratio {
                Some(format!("scale={}:{}:force_original_aspect_ratio=decrease", w, h))
            } else {
                Some(format!("scale={}:{}", w, h))
            }
        } else {
            None
        }
    } else if let Some(w) = req.target_width {
        if w > 0 {
            Some(format!("scale={}:-1", w))
        } else {
            None
        }
    } else if let Some(h) = req.target_height {
        if h > 0 {
            Some(format!("scale=-1:{}", h))
        } else {
            None
        }
    } else {
        None
    };

    if let Some(filter) = scale_filter {
        cmd.arg("-vf").arg(filter);
    }

    let quality = req.quality.unwrap_or(85);

    match req.target_format {
        ImageFormatType::Jpg | ImageFormatType::Jpeg => {
            let qscale = ((100 - quality as u32) * 30 / 100).max(1).min(31);
            cmd.args(["-q:v", &qscale.to_string()]);
        }
        ImageFormatType::Webp => {
            cmd.args(["-c:v", "libwebp", "-quality", &quality.to_string()]);
        }
        ImageFormatType::Avif => {
            cmd.args(["-c:v", "libaom-av1", "-crf", &(30 + (100 - quality) / 3).to_string()]);
        }
        ImageFormatType::Png => {
            cmd.args(["-c:v", "png"]);
        }
        ImageFormatType::Gif => {
            cmd.args(["-c:v", "gif"]);
        }
        ImageFormatType::Bmp => {
            cmd.args(["-c:v", "bmp"]);
        }
        ImageFormatType::Tiff => {
            cmd.args(["-c:v", "tiff"]);
        }
        _ => {}
    }

    cmd.arg(&req.output_path);

    let output = cmd.output().context("Failed to execute ffmpeg command")?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("FFmpeg error (status {:?}): {}", output.status, err_msg.trim());
    }

    Ok(())
}
