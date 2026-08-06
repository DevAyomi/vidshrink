use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Copy, Clone, Debug, ValueEnum, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Codec {
    H264,
    H265,
    Av1,
}

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

#[derive(Copy, Clone, Debug, ValueEnum, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Quality {
    VisuallyLossless,
    Balanced,
    MaxCompression,
}

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
            (VisuallyLossless, H264) => EncodeParams {
                crf: 18.0,
                speed_preset: "slow",
                extra_args: vec![],
            },
            (VisuallyLossless, H265) => EncodeParams {
                crf: 20.0,
                speed_preset: "slow",
                extra_args: vec![],
            },
            (VisuallyLossless, Av1) => EncodeParams {
                crf: 24.0,
                speed_preset: "6",
                extra_args: vec![],
            },

            (Balanced, H264) => EncodeParams {
                crf: 23.0,
                speed_preset: "medium",
                extra_args: vec![],
            },
            (Balanced, H265) => EncodeParams {
                crf: 26.0,
                speed_preset: "medium",
                extra_args: vec![],
            },
            (Balanced, Av1) => EncodeParams {
                crf: 32.0,
                speed_preset: "8",
                extra_args: vec![],
            },

            (MaxCompression, H264) => EncodeParams {
                crf: 28.0,
                speed_preset: "slower",
                extra_args: vec![],
            },
            (MaxCompression, H265) => EncodeParams {
                crf: 32.0,
                speed_preset: "slower",
                extra_args: vec![],
            },
            (MaxCompression, Av1) => EncodeParams {
                crf: 40.0,
                speed_preset: "9",
                extra_args: vec![],
            },
        }
    }
}

impl fmt::Display for Quality {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Quality::VisuallyLossless => "visually-lossless",
            Quality::Balanced => "balanced",
            Quality::MaxCompression => "max-compression",
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