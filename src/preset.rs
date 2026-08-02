use clap::ValueEnum;
use std::fmt;

#[derive(Copy, Clone, Debug, ValueEnum, PartialEq, Eq)]
pub enum Codec { H264, H265, Av1 }

impl fmt::Display for Codec {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Codec::H264 => "H.264",
            Codec::H265 => "H.265/HEVC",
            Codec::Av1 => "AV1",
        };
        write!(f, "{s}")
    }
}

#[derive(Copy, Clone, Debug, ValueEnum, PartialEq, Eq)]
pub enum Quality { Lossless, VisuallyLossless, High, Balanced }

pub struct EncodeParams {
    pub crf: f32,
    pub speed_preset: &'static str,
    pub extra_args: Vec<String>,
}

impl Quality {
    pub fn params_for(&self, codec: Codec) -> EncodeParams {
        use Codec::*;
        use Quality::*;
        match (self, codec) {
            (Lossless, H264) => EncodeParams { crf: 0.0, speed_preset: "veryslow", extra_args: vec![] },
            (Lossless, H265) => EncodeParams { crf: 0.0, speed_preset: "veryslow", extra_args: vec!["-x265-params".into(), "lossless=1".into()] },
            (Lossless, Av1)  => EncodeParams { crf: 0.0, speed_preset: "4", extra_args: vec!["-preset".into(), "4".into()] },

            (VisuallyLossless, H264) => EncodeParams { crf: 16.0, speed_preset: "slow", extra_args: vec![] },
            (VisuallyLossless, H265) => EncodeParams { crf: 18.0, speed_preset: "slow", extra_args: vec![] },
            (VisuallyLossless, Av1)  => EncodeParams { crf: 24.0, speed_preset: "6", extra_args: vec![] },

            (High, H264) => EncodeParams { crf: 20.0, speed_preset: "medium", extra_args: vec![] },
            (High, H265) => EncodeParams { crf: 22.0, speed_preset: "medium", extra_args: vec![] },
            (High, Av1)  => EncodeParams { crf: 30.0, speed_preset: "7", extra_args: vec![] },

            (Balanced, H264) => EncodeParams { crf: 23.0, speed_preset: "medium", extra_args: vec![] },
            (Balanced, H265) => EncodeParams { crf: 26.0, speed_preset: "medium", extra_args: vec![] },
            (Balanced, Av1)  => EncodeParams { crf: 34.0, speed_preset: "8", extra_args: vec![] },
        }
    }
}

impl fmt::Display for Quality {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Quality::Lossless => "lossless",
            Quality::VisuallyLossless => "visually-lossless",
            Quality::High => "high",
            Quality::Balanced => "balanced",
        };
        write!(f, "{s}")
    }
}

pub fn ffmpeg_encoder_name(codec: Codec) -> &'static str {
    match codec {
        Codec::H264 => "libx264",
        Codec::H265 => "libx265",
        Codec::Av1 => "libsvtav1",
    }
}