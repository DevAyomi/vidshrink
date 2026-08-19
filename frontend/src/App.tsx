import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  RotateCw,
  Play,
  Pause,
  Scissors,
  Check,
  Upload,
  ArrowRight,
  Sparkles,
  Volume2,
  Maximize2,
  Film,
  UploadCloud,
  Cpu,
  HelpCircle,
  ShieldCheck,
  Eye,
  Video,
  X,
  Lock,
  LogOut,
  Zap,
  Image as ImageIcon,
  Download
} from 'lucide-react';
import './App.css';

interface VideoPreset {
  name: string;
  width: number;
  height: number;
}

const RESOLUTIONS: VideoPreset[] = [
  { name: '1080×960 (VidShrink Default)', width: 1080, height: 960 },
  { name: '3840×2160 (4K UHD)', width: 3840, height: 2160 },
  { name: '1920×1080 (1080p Full HD)', width: 1920, height: 1080 },
  { name: '1280×720 (720p HD)', width: 1280, height: 720 },
  { name: '854×480 (480p SD)', width: 854, height: 480 },
];

interface ImageFormatOption {
  key: string;
  name: string;
  desc: string;
  isLossy?: boolean;
}

const IMAGE_FORMATS: ImageFormatOption[] = [
  { key: 'png', name: 'PNG', desc: 'Lossless & Transparency' },
  { key: 'jpg', name: 'JPG', desc: 'Standard Photo & Compact', isLossy: true },
  { key: 'webp', name: 'WEBP', desc: 'Modern Web & Efficient', isLossy: true },
  { key: 'avif', name: 'AVIF', desc: 'Next-Gen Ultra Small', isLossy: true },
  { key: 'gif', name: 'GIF', desc: 'Graphics & Palette' },
  { key: 'bmp', name: 'BMP', desc: 'Raw Bitmap Image' },
  { key: 'tiff', name: 'TIFF', desc: 'High-Res Print Quality' },
  { key: 'ico', name: 'ICO', desc: 'Icon / Favicon Format' },
];

const getApiBaseUrl = () => {
  let envUrl = (import.meta.env.VITE_API_URL as string || '').trim();
  if (!envUrl) return 'http://127.0.0.1:8080';
  if (!envUrl.startsWith('http://') && !envUrl.startsWith('https://')) {
    envUrl = `https://${envUrl}`;
  }
  return envUrl.replace(/\/$/, '');
};

const API_BASE_URL = getApiBaseUrl();

export function App() {
  // Mode selection: 'video' or 'image'
  const [appMode, setAppMode] = useState<'video' | 'image'>('video');

  // Video & File state
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [compressedVideoUrl, setCompressedVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [originalSizeBytes, setOriginalSizeBytes] = useState<number>(0);
  const [actualCompressedBytes, setActualCompressedBytes] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);

  // Video Settings
  const [selectedResolution, setSelectedResolution] = useState<VideoPreset>(RESOLUTIONS[0]);
  const [isResDropdownOpen, setIsResDropdownOpen] = useState(false);
  const [qualityPreset, setQualityPreset] = useState<'visually-lossless' | 'balanced' | 'max-compression'>('balanced');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [codec, setCodec] = useState<'h265' | 'h264' | 'av1'>('h265');
  const [audioBitrate, setAudioBitrate] = useState<number>(192);

  // Video Split View Slider position (0 to 100%)
  const [splitPos, setSplitPos] = useState<number>(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);

  // Video Processing & Engine state
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const [jobStatusText, setJobStatusText] = useState('Queued in worker pool...');
  const [compressDone, setCompressDone] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isRustEngineConnected, setIsRustEngineConnected] = useState<boolean>(true);

  // ══════════════════════════════════════════════════════════
  // IMAGE CONVERTER STATE
  // ══════════════════════════════════════════════════════════
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [convertedImageUrl, setConvertedImageUrl] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');
  const [imageOriginalBytes, setImageOriginalBytes] = useState<number>(0);
  const [imageConvertedBytes, setImageConvertedBytes] = useState<number | null>(null);
  const [targetFormat, setTargetFormat] = useState<string>('png');
  const [imageQuality, setImageQuality] = useState<number>(85);
  const [imgOrigWidth, setImgOrigWidth] = useState<number>(0);
  const [imgOrigHeight, setImgOrigHeight] = useState<number>(0);
  const [targetWidth, setTargetWidth] = useState<number | ''>('');
  const [targetHeight, setTargetHeight] = useState<number | ''>('');
  const [scalePct, setScalePct] = useState<number>(100);
  const [keepAspectRatio, setKeepAspectRatio] = useState<boolean>(true);
  const [isConvertingImage, setIsConvertingImage] = useState<boolean>(false);
  const [imageConvertDone, setImageConvertDone] = useState<boolean>(false);
  const [imageConvertStatus, setImageConvertStatus] = useState<string>('');
  const [imageSplitPos, setImageSplitPos] = useState<number>(50);
  const [isDraggingImageSplit, setIsDraggingImageSplit] = useState<boolean>(false);

  // Stats & Modals state
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [pageViewsCount, setPageViewsCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('vidshrink_page_views') || '1', 10);
  });
  const [videosCompressedCount, setVideosCompressedCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('vidshrink_videos_compressed') || '0', 10);
  });

  // Refs
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const imageSplitContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const videoOrigRef = useRef<HTMLVideoElement>(null);
  const videoCompRef = useRef<HTMLVideoElement>(null);

  // Fetch admin stats
  const fetchStats = () => {
    fetch(`${API_BASE_URL}/api/stats`)
      .then(res => res.json())
      .then(data => {
        if (data.page_views) {
          const localViews = parseInt(localStorage.getItem('vidshrink_page_views') || '1', 10);
          const maxViews = Math.max(localViews, data.page_views);
          localStorage.setItem('vidshrink_page_views', maxViews.toString());
          setPageViewsCount(maxViews);
        }
        if (data.videos_compressed !== undefined) {
          const localComp = parseInt(localStorage.getItem('vidshrink_videos_compressed') || '0', 10);
          const maxComp = Math.max(localComp, data.videos_compressed);
          localStorage.setItem('vidshrink_videos_compressed', maxComp.toString());
          setVideosCompressedCount(maxComp);
        }
      })
      .catch(() => {});
  };

  // Track page views on initial load & handle /admin route
  useEffect(() => {
    if (window.location.pathname === '/admin' || window.location.pathname === '/admin/') {
      setShowAdminModal(true);
      fetchStats();
    }

    try {
      const savedResultStr = sessionStorage.getItem('vidshrink_saved_result');
      if (savedResultStr) {
        const saved = JSON.parse(savedResultStr);
        if (saved.url) {
          setCompressedVideoUrl(saved.url);
          setCustomVideoUrl(saved.url);
          setFileName(saved.fileName || 'compressed_video.mp4');
          setOriginalSizeBytes(saved.origSize || 0);
          setActualCompressedBytes(saved.compSize || 0);
          setCompressDone(true);
          setMobileStep(3);
        }
      }
    } catch (e) {}

    const localViews = (parseInt(localStorage.getItem('vidshrink_page_views') || '0', 10)) + 1;
    localStorage.setItem('vidshrink_page_views', localViews.toString());
    setPageViewsCount(localViews);

    fetch(`${API_BASE_URL}/api/track-view`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.page_views) {
          const currentLocal = parseInt(localStorage.getItem('vidshrink_page_views') || '1', 10);
          const maxViews = Math.max(currentLocal, data.page_views);
          localStorage.setItem('vidshrink_page_views', maxViews.toString());
          setPageViewsCount(maxViews);
        }
        if (data.videos_compressed !== undefined) {
          const localComp = parseInt(localStorage.getItem('vidshrink_videos_compressed') || '0', 10);
          const maxComp = Math.max(localComp, data.videos_compressed);
          localStorage.setItem('vidshrink_videos_compressed', maxComp.toString());
          setVideosCompressedCount(maxComp);
        }
      })
      .catch(() => {});
  }, []);

  // Size calculations for video
  const originalSizeMB = originalSizeBytes > 0 ? (originalSizeBytes / (1024 * 1024)).toFixed(2) : '0.00';
  const calculatedReducedSizeMB = actualCompressedBytes !== null
    ? (actualCompressedBytes / (1024 * 1024)).toFixed(2)
    : originalSizeBytes > 0
    ? ((parseFloat(originalSizeMB)) * (qualityPreset === 'max-compression' ? 0.4 : qualityPreset === 'visually-lossless' ? 0.75 : 0.6) * (selectedResolution.width * selectedResolution.height) / (1080 * 960)).toFixed(2)
    : '0.00';
  const reducedDiffMB = originalSizeBytes > 0 ? (parseFloat(originalSizeMB) - parseFloat(calculatedReducedSizeMB)).toFixed(1) : '0.0';

  // Size calculations for image
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const imageOrigFormatted = formatBytes(imageOriginalBytes);
  const imageConvertedFormatted = imageConvertedBytes !== null ? formatBytes(imageConvertedBytes) : null;
  const imageSavingsPct = (imageOriginalBytes > 0 && imageConvertedBytes !== null)
    ? ((1 - imageConvertedBytes / imageOriginalBytes) * 100).toFixed(1)
    : null;

  // Handle Dragging Split View Slider (Video)
  const handleMouseDown = () => setIsDraggingSplit(true);
  const handleMouseUp = () => setIsDraggingSplit(false);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingSplit || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newPct = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSplitPos(newPct);
  };

  // Handle Dragging Split View Slider (Image)
  const handleImageMouseDown = () => setIsDraggingImageSplit(true);
  const handleImageMouseUp = () => setIsDraggingImageSplit(false);
  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingImageSplit || !imageSplitContainerRef.current) return;
    const rect = imageSplitContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newPct = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setImageSplitPos(newPct);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleResetAll = () => {
    sessionStorage.removeItem('vidshrink_saved_result');
    setCustomVideoUrl(null);
    setCompressedVideoUrl(null);
    setActualCompressedBytes(null);
    setSelectedFileObj(null);
    setCompressDone(false);
    setIsCompressing(false);
    setMobileStep(1);
  };

  const handleResetImage = () => {
    setSelectedImageFile(null);
    setOriginalImageUrl(null);
    setConvertedImageUrl(null);
    setImageConvertedBytes(null);
    setImageConvertDone(false);
    setIsConvertingImage(false);
    setTargetWidth('');
    setTargetHeight('');
    setScalePct(100);
    setMobileStep(1);
  };

  const MAX_FILE_SIZE_BYTES = 60 * 1024 * 1024; // 60 MB limit

  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('video/')) {
      // If user dropped an image while in video mode, offer to switch
      if (file.type.startsWith('image/')) {
        setAppMode('image');
        handleImageFileChange(file);
        return;
      }
      alert('Please select a valid video file (MP4, MOV, WebM, etc.)');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed limit of 60 MB.`);
      return;
    }
    sessionStorage.removeItem('vidshrink_saved_result');
    setSelectedFileObj(file);
    setFileName(file.name);
    setOriginalSizeBytes(file.size);
    const url = URL.createObjectURL(file);
    setCustomVideoUrl(url);
    setCompressedVideoUrl(null);
    setActualCompressedBytes(null);
    setCompressDone(false);
    setIsPlaying(true);
    setMobileStep(2);
  };

  // Image file handler
  const handleImageFileChange = (file: File) => {
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|tiff|tif|ico|avif|svg|heic)$/i.test(file.name);
    if (!isImage) {
      alert('Please select a valid image file (JPG, PNG, WEBP, GIF, BMP, TIFF, ICO, AVIF, SVG, etc.)');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      alert('Image size exceeds 100 MB limit.');
      return;
    }

    setSelectedImageFile(file);
    setImageFileName(file.name);
    setImageOriginalBytes(file.size);
    setConvertedImageUrl(null);
    setImageConvertedBytes(null);
    setImageConvertDone(false);

    // Auto-pick a sensible target format different from current
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    if (ext === 'jpg' || ext === 'jpeg') {
      setTargetFormat('png');
    } else if (ext === 'png') {
      setTargetFormat('webp');
    } else {
      setTargetFormat('png');
    }

    const url = URL.createObjectURL(file);
    setOriginalImageUrl(url);

    // Read natural dimensions
    const img = new window.Image();
    img.onload = () => {
      setImgOrigWidth(img.naturalWidth);
      setImgOrigHeight(img.naturalHeight);
      setTargetWidth(img.naturalWidth);
      setTargetHeight(img.naturalHeight);
    };
    img.src = url;

    setMobileStep(2);
  };

  const handleScalePresetClick = (pct: number) => {
    setScalePct(pct);
    if (imgOrigWidth > 0 && imgOrigHeight > 0) {
      if (pct === 100) {
        setTargetWidth(imgOrigWidth);
        setTargetHeight(imgOrigHeight);
      } else {
        const factor = pct / 100;
        setTargetWidth(Math.round(imgOrigWidth * factor));
        setTargetHeight(Math.round(imgOrigHeight * factor));
      }
    }
  };

  const handleWidthChange = (val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) {
      setTargetWidth('');
      return;
    }
    setTargetWidth(num);
    if (keepAspectRatio && imgOrigWidth > 0 && imgOrigHeight > 0) {
      const aspect = imgOrigHeight / imgOrigWidth;
      setTargetHeight(Math.round(num * aspect));
    }
  };

  const handleHeightChange = (val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) {
      setTargetHeight('');
      return;
    }
    setTargetHeight(num);
    if (keepAspectRatio && imgOrigWidth > 0 && imgOrigHeight > 0) {
      const aspect = imgOrigWidth / imgOrigHeight;
      setTargetWidth(Math.round(num * aspect));
    }
  };

  const handleStartImageConversion = async () => {
    if (!selectedImageFile) {
      alert('Please upload an image file first!');
      return;
    }

    setIsConvertingImage(true);
    setImageConvertDone(false);
    setImageConvertStatus('Converting image with Rust engine...');

    try {
      const formData = new FormData();
      formData.append('file', selectedImageFile);
      formData.append('format', targetFormat);
      formData.append('quality', imageQuality.toString());
      if (targetWidth && typeof targetWidth === 'number' && targetWidth > 0) {
        formData.append('width', targetWidth.toString());
      }
      if (targetHeight && typeof targetHeight === 'number' && targetHeight > 0) {
        formData.append('height', targetHeight.toString());
      }
      formData.append('keepAspectRatio', keepAspectRatio.toString());

      const res = await fetch(`${API_BASE_URL}/api/convert-image`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Image conversion failed');
      }

      const data = await res.json();
      if (data.success && data.converted_url) {
        const downloadUrl = data.converted_url.startsWith('http')
          ? data.converted_url
          : `${API_BASE_URL}${data.converted_url}`;

        setConvertedImageUrl(downloadUrl);
        setImageConvertedBytes(data.converted_size_bytes);
        setImageConvertDone(true);
        setIsConvertingImage(false);
        setMobileStep(3);

        const newLocalComp = parseInt(localStorage.getItem('vidshrink_videos_compressed') || '0', 10) + 1;
        localStorage.setItem('vidshrink_videos_compressed', newLocalComp.toString());
        setVideosCompressedCount(newLocalComp);
        fetchStats();
      } else {
        throw new Error('Conversion output not received');
      }
    } catch (err: any) {
      console.error('Image conversion error:', err);
      alert(`Image conversion failed: ${err?.message || err}`);
      setIsConvertingImage(false);
    }
  };

  const handleDownloadConvertedImage = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!convertedImageUrl) {
      alert('No converted image available!');
      return;
    }

    try {
      const res = await fetch(convertedImageUrl);
      if (!res.ok) throw new Error('Failed downloading converted file');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const stem = imageFileName.substring(0, imageFileName.lastIndexOf('.')) || imageFileName;
      const downloadName = `${stem}.${targetFormat}`;

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      const stem = imageFileName.substring(0, imageFileName.lastIndexOf('.')) || imageFileName;
      const downloadName = `${stem}.${targetFormat}`;
      const link = document.createElement('a');
      link.href = convertedImageUrl;
      link.download = downloadName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (appMode === 'image') {
        handleImageFileChange(file);
      } else {
        handleFileChange(file);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (appMode === 'image' || file.type.startsWith('image/')) {
        setAppMode('image');
        handleImageFileChange(file);
      } else {
        handleFileChange(file);
      }
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const startTime = Date.now();
    const maxTimeoutMs = 15 * 60 * 1000;

    while (Date.now() - startTime < maxTimeoutMs) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
        if (!res.ok) continue;
        const data = await res.json();
        const status = data.status;

        if (status === 'Queued' || (typeof status === 'object' && 'Queued' in status)) {
          setJobStatusText('Queued in Redis worker pool...');
          setCompressProgress((prev) => Math.min(prev + 2, 40));
        } else if (typeof status === 'object' && 'Processing' in status) {
          setJobStatusText('Worker running FFmpeg encode...');
          setCompressProgress((prev) => Math.min(prev + 5, 90));
        } else if (typeof status === 'object' && 'Completed' in status) {
          const result = status.Completed.result;
          const downloadUrl = result.compressed_url.startsWith('http')
            ? result.compressed_url
            : `${API_BASE_URL}${result.compressed_url}`;

          setCompressedVideoUrl(downloadUrl);
          setActualCompressedBytes(result.compressed_size_bytes);
          setIsRustEngineConnected(true);
          setCompressProgress(100);
          setIsCompressing(false);
          setCompressDone(true);

          try {
            sessionStorage.setItem(
              'vidshrink_saved_result',
              JSON.stringify({
                url: downloadUrl,
                fileName: fileName,
                origSize: originalSizeBytes,
                compSize: result.compressed_size_bytes,
              })
            );
          } catch (e) {}

          const newLocalComp = parseInt(localStorage.getItem('vidshrink_videos_compressed') || '0', 10) + 1;
          localStorage.setItem('vidshrink_videos_compressed', newLocalComp.toString());
          setVideosCompressedCount(newLocalComp);
          fetchStats();
          return;
        } else if (typeof status === 'object' && 'Failed' in status) {
          throw new Error(status.Failed.error || 'Encoding failed on worker server');
        }
      } catch (err: any) {
        console.error('Job status polling error:', err);
        setIsCompressing(false);
        alert(`Compression failed: ${err?.message || err}`);
        return;
      }
    }
    setIsCompressing(false);
    alert('Compression timed out.');
  };

  const handleStartCompression = async () => {
    if (!customVideoUrl || !selectedFileObj) {
      alert('Please upload a video file first!');
      return;
    }

    setMobileStep(3);
    setIsCompressing(true);
    setCompressProgress(10);
    setJobStatusText('Streaming video chunks to disk...');
    setCompressDone(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFileObj);
      formData.append('codec', codec);
      formData.append('quality', qualityPreset);
      formData.append('width', selectedResolution.width.toString());
      formData.append('height', selectedResolution.height.toString());
      formData.append('audioBitrate', audioBitrate.toString());

      setCompressProgress(20);

      const res = await fetch(`${API_BASE_URL}/api/compress`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Server compression request failed');
      }

      const data = await res.json();
      if (data.success && data.job_id) {
        setJobStatusText('Upload complete! Job pushed to Redis queue...');
        setCompressProgress(30);
        await pollJobStatus(data.job_id);
      } else {
        throw new Error('Server returned invalid job ID response');
      }
    } catch (err: any) {
      console.error('Rust FFmpeg server error:', err);
      setIsRustEngineConnected(false);
      alert(`Compression error: ${err?.message || err}`);
      setIsCompressing(false);
    }
  };

  const handleDownloadCompressed = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!compressedVideoUrl) {
      alert('No compressed video file available yet!');
      return;
    }

    try {
      const res = await fetch(compressedVideoUrl);
      if (!res.ok) throw new Error('Failed fetching video file');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName ? `compressed_${fileName}` : 'compressed_video.mp4';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      const link = document.createElement('a');
      link.href = compressedVideoUrl;
      link.download = fileName ? `compressed_${fileName}` : 'compressed_video.mp4';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    if (adminEmail === 'admin@gmail.com' && adminPassword === 'password') {
      setIsAdminLoggedIn(true);
      fetchStats();
    } else {
      setAdminError('Invalid email or password');
    }
  };

  const togglePlay = () => {
    if (videoOrigRef.current && videoCompRef.current) {
      if (isPlaying) {
        videoOrigRef.current.pause();
        videoCompRef.current.pause();
      } else {
        videoOrigRef.current.play();
        videoCompRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const isSelectedFormatLossy = IMAGE_FORMATS.find(f => f.key === targetFormat)?.isLossy;

  return (
    <div className="app-container">
      {/* App Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="brand-logo" onClick={() => { setCustomVideoUrl(null); setOriginalImageUrl(null); }}>
            VIDSHRINK <span className="brand-badge" style={{ background: '#166534', color: '#DCFCE7' }}>100% FREE</span>
          </div>
          <div className="nav-item" onClick={() => setShowHowToUse(true)}>
            <HelpCircle size={16} />
            <span>How to Use</span>
          </div>
        </div>

        <div className="header-credibility-pill">
          <div className="cred-item">
            <Eye size={14} style={{ color: '#0066FF' }} />
            <span><strong>{pageViewsCount.toLocaleString()}</strong> Visitors</span>
          </div>
          <span className="cred-dot">•</span>
          <div className="cred-item">
            <Video size={14} style={{ color: '#16A34A' }} />
            <span><strong>{videosCompressedCount.toLocaleString()}</strong> Processed</span>
          </div>
        </div>

        <div className="header-right">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: isRustEngineConnected ? '#166534' : '#9A3412', background: isRustEngineConnected ? '#F0FDF4' : '#FFEDD5', padding: '4px 10px', borderRadius: 9999, border: `1px solid ${isRustEngineConnected ? '#BBF7D0' : '#FED7AA'}` }}>
            <Cpu size={14} />
            {isRustEngineConnected ? 'Rust High-Speed Engine Active' : 'Preview Mode'}
          </div>
        </div>
      </header>

      {/* Mode Switcher Bar */}
      <div className="mode-switcher-bar">
        <div className="mode-pills-wrapper">
          <button
            type="button"
            className={`mode-pill-btn ${appMode === 'video' ? 'active' : ''}`}
            onClick={() => setAppMode('video')}
          >
            <Video size={16} style={{ color: appMode === 'video' ? '#0066FF' : '#64748B' }} />
            <span>Video Compressor</span>
          </button>
          <button
            type="button"
            className={`mode-pill-btn ${appMode === 'image' ? 'active' : ''}`}
            onClick={() => setAppMode('image')}
          >
            <ImageIcon size={16} style={{ color: appMode === 'image' ? '#0066FF' : '#64748B' }} />
            <span>Image Converter</span>
            <span className="mode-pill-badge">ALL FORMATS</span>
          </button>
        </div>
      </div>

      {/* How to Use Modal */}
      {showHowToUse && (
        <div className="modal-backdrop" onClick={() => setShowHowToUse(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <HelpCircle size={20} style={{ color: '#0066FF' }} />
                How to Use VidShrink & Image Converter
              </h3>
              <button className="modal-close-btn" onClick={() => setShowHowToUse(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="how-to-body">
              <div className="step-card">
                <div className="step-num">1</div>
                <div className="step-content">
                  <h4>Choose Your Mode & Upload</h4>
                  <p>Select <strong>Video Compressor</strong> or <strong>Image Converter</strong> at the top. Drag & drop any video or image file (JPG, PNG, WEBP, GIF, BMP, TIFF, AVIF, SVG, etc.).</p>
                </div>
              </div>

              <div className="step-card">
                <div className="step-num">2</div>
                <div className="step-content">
                  <h4>Select Format, Quality & Dimensions</h4>
                  <p>Pick target format (e.g. JPG to PNG, PNG to WEBP, etc.), adjust quality slider (1-100), or resize with custom/preset dimensions.</p>
                </div>
              </div>

              <div className="step-card">
                <div className="step-num">3</div>
                <div className="step-content">
                  <h4>Compare & Download Instantly</h4>
                  <p>Use the interactive Before & After slider to compare visual quality and download your converted file with high compression savings.</p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-modal-primary" onClick={() => setShowHowToUse(false)}>
                Got it, let's go!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {showAdminModal && (
        <div className="modal-backdrop" onClick={() => setShowAdminModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <ShieldCheck size={20} style={{ color: '#0066FF' }} />
                VidShrink Admin Panel
              </h3>
              <button className="modal-close-btn" onClick={() => setShowAdminModal(false)}>
                <X size={18} />
              </button>
            </div>

            {!isAdminLoggedIn ? (
              <form onSubmit={handleAdminLogin} className="admin-login-form">
                <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
                  Log in to access administrative metrics and platform statistics.
                </p>
                
                {adminError && <div className="admin-error-box">{adminError}</div>}

                <div className="form-group">
                  <label className="form-label">Admin Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-modal-primary" style={{ marginTop: 20, width: '100%' }}>
                  <Lock size={16} />
                  Login to Admin Panel
                </button>
              </form>
            ) : (
              <div className="admin-dashboard">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>
                    Welcome back, <strong>admin@gmail.com</strong>
                  </div>
                  <button
                    className="btn-logout"
                    onClick={() => setIsAdminLoggedIn(false)}
                  >
                    <LogOut size={14} />
                    Logout
                  </button>
                </div>

                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                      <Eye size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-label">Total Page Views</span>
                      <span className="stat-number">{pageViewsCount}</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: '#F0FDF4', color: '#16A34A' }}>
                      <Video size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-label">Total Media Converted</span>
                      <span className="stat-number">{videosCompressedCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         IMAGE CONVERTER INTERFACE
         ══════════════════════════════════════════════════════════ */}
      {appMode === 'image' && (
        <main className={`app-body mobile-step-${mobileStep}`}>
          {/* Mobile Step Wizard */}
          <div className="mobile-step-wizard">
            <div
              className={`wizard-step ${mobileStep === 1 ? 'active' : ''} ${mobileStep > 1 ? 'completed' : ''}`}
              onClick={() => setMobileStep(1)}
            >
              <div className="step-badge">{mobileStep > 1 ? <Check size={12} /> : '1'}</div>
              <span className="step-label">1. Select</span>
            </div>
            <div className="wizard-line" />
            <div
              className={`wizard-step ${mobileStep === 2 ? 'active' : ''} ${mobileStep > 2 ? 'completed' : ''}`}
              onClick={() => { if (originalImageUrl) setMobileStep(2); }}
            >
              <div className="step-badge">{mobileStep > 2 ? <Check size={12} /> : '2'}</div>
              <span className="step-label">2. Options</span>
            </div>
            <div className="wizard-line" />
            <div
              className={`wizard-step ${mobileStep === 3 ? 'active' : ''}`}
              onClick={() => { if (isConvertingImage || imageConvertDone) setMobileStep(3); }}
            >
              <div className="step-badge">3</div>
              <span className="step-label">3. Download</span>
            </div>
          </div>

          {/* Left Options Panel (Image) */}
          <section className="options-panel">
            <h2 className="options-title">
              <ChevronLeft size={24} className="options-title-icon" onClick={handleResetImage} />
              Image Conversion
            </h2>

            {/* Target Format Card */}
            <div className="setting-card">
              <div className="setting-card-header">
                <span className="setting-label">Convert To Format</span>
                <span style={{ fontSize: 12, color: '#0066FF', fontWeight: 600 }}>.{targetFormat.toUpperCase()}</span>
              </div>
              
              <div className="format-grid">
                {IMAGE_FORMATS.map((fmt) => (
                  <button
                    key={fmt.key}
                    type="button"
                    className={`format-btn ${targetFormat === fmt.key ? 'active' : ''}`}
                    onClick={() => setTargetFormat(fmt.key)}
                  >
                    <span className="format-btn-name">{fmt.name}</span>
                    <span className="format-btn-desc">{fmt.key.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Slider (for lossy formats) */}
            {isSelectedFormatLossy && (
              <div className="setting-card">
                <div className="quality-slider-container">
                  <div className="quality-slider-header">
                    <span>Quality / Compression</span>
                    <span className="quality-val-badge">{imageQuality}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={imageQuality}
                    onChange={(e) => setImageQuality(Number(e.target.value))}
                    className="range-input-custom"
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8' }}>
                    <span>Max Savings (10%)</span>
                    <span>Balanced (85%)</span>
                    <span>Lossless (100%)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Resize & Dimensions Card */}
            <div className="setting-card">
              <div className="setting-card-header">
                <span className="setting-label">Scale & Dimensions</span>
                {imgOrigWidth > 0 && (
                  <span style={{ fontSize: 11, color: '#64748B' }}>Original: {imgOrigWidth}×{imgOrigHeight}</span>
                )}
              </div>

              <div className="scale-presets-row">
                {[100, 75, 50, 25].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className={`scale-preset-btn ${scalePct === pct ? 'active' : ''}`}
                    onClick={() => handleScalePresetClick(pct)}
                  >
                    {pct === 100 ? 'Original' : `${pct}%`}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <div className="form-group">
                  <label className="form-label">Width (px)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder={imgOrigWidth ? imgOrigWidth.toString() : 'Width'}
                    value={targetWidth}
                    onChange={(e) => handleWidthChange(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Height (px)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder={imgOrigHeight ? imgOrigHeight.toString() : 'Height'}
                    value={targetHeight}
                    onChange={(e) => handleHeightChange(e.target.value)}
                  />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', marginTop: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={keepAspectRatio}
                  onChange={(e) => setKeepAspectRatio(e.target.checked)}
                />
                Maintain aspect ratio
              </label>
            </div>

            {/* Size Summary */}
            <div className="summary-block">
              <span className="summary-label">
                {imageConvertDone ? 'Result Output Size' : 'Original Image Size'}
              </span>
              <div className="summary-size-wrapper">
                <span className="summary-size-main">
                  {imageConvertedFormatted || imageOrigFormatted}
                </span>
                {imageConvertedBytes !== null && (
                  <span className="summary-size-old">{imageOrigFormatted}</span>
                )}
              </div>
              {imageSavingsPct && (
                <span className="summary-savings-tag">
                  {parseFloat(imageSavingsPct) >= 0 ? `${imageSavingsPct}% smaller` : `${Math.abs(parseFloat(imageSavingsPct))}% change`}
                </span>
              )}
            </div>

            {/* Convert Button */}
            <button
              className="btn-compress"
              onClick={handleStartImageConversion}
              disabled={isConvertingImage || !originalImageUrl}
            >
              {isConvertingImage ? (
                <>
                  <RotateCw size={18} className="animate-spin-fast" />
                  {imageConvertStatus || 'Converting Image...'}
                </>
              ) : imageConvertDone ? (
                <>
                  <Check size={18} />
                  Conversion Ready!
                </>
              ) : (
                <>
                  Convert to {targetFormat.toUpperCase()}
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            {originalImageUrl && (
              <div className="selected-file-card">
                <div className="file-info-group">
                  <div className="file-icon-badge">
                    <ImageIcon size={18} />
                  </div>
                  <div className="file-details">
                    <span className="file-name-text" title={imageFileName}>{imageFileName}</span>
                    <span className="file-size-badge">{imageOrigFormatted}</span>
                  </div>
                </div>
                <button
                  className="btn-change-video"
                  onClick={() => imageFileInputRef.current?.click()}
                >
                  <Upload size={12} />
                  Change
                </button>
              </div>
            )}

            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.tif,.ico,.avif,.svg,.heic"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />

            {imageConvertDone && (
              <div className="thank-you-card">
                <div className="thank-you-header">
                  <div className="thank-you-badge">
                    <Sparkles size={24} style={{ color: '#166534' }} />
                  </div>
                  <h3 className="thank-you-title">🎉 Converted to {targetFormat.toUpperCase()}</h3>
                  <p className="thank-you-subtext">
                    From <strong>{imageOrigFormatted}</strong> to <strong>{imageConvertedFormatted}</strong>
                  </p>
                </div>

                <div className="thank-you-actions">
                  <button
                    onClick={handleDownloadConvertedImage}
                    className="btn-download-primary"
                  >
                    <Download size={18} />
                    Download {targetFormat.toUpperCase()} ({imageConvertedFormatted})
                  </button>
                  <button
                    onClick={handleResetImage}
                    className="btn-reset-step"
                  >
                    <RotateCw size={14} />
                    Convert Another Image
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Right Preview Card (Image) */}
          <section className="preview-card">
            {!originalImageUrl ? (
              <div
                className={`upload-dropzone ${isDraggingOver ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={handleDrop}
                onClick={() => imageFileInputRef.current?.click()}
              >
                <div className="upload-icon-wrapper" style={{ background: '#EFF6FF', color: '#0066FF' }}>
                  <ImageIcon size={36} />
                </div>
                <div className="upload-headline">Upload image to convert to any format</div>
                <div className="upload-subtext">
                  Supports JPG, PNG, WEBP, AVIF, GIF, BMP, TIFF, ICO, SVG, HEIC & more!
                </div>

                <div className="dropzone-credibility-bar">
                  <div className="cred-stat-item">
                    <Eye size={15} style={{ color: '#0066FF' }} />
                    <span><strong>{pageViewsCount.toLocaleString()}</strong> Page Visitors</span>
                  </div>
                  <div className="cred-stat-divider">|</div>
                  <div className="cred-stat-item">
                    <ImageIcon size={15} style={{ color: '#16A34A' }} />
                    <span><strong>{videosCompressedCount.toLocaleString()}</strong> Media Converted</span>
                  </div>
                </div>

                <button className="btn-select-file">
                  Select Image File
                </button>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px' }}>
                  Convert JPG ➔ PNG, PNG ➔ WEBP, WEBP ➔ JPG or Any Format!
                </div>
              </div>
            ) : (
              <>
                <div
                  ref={imageSplitContainerRef}
                  className="image-split-container"
                  onMouseDown={handleImageMouseDown}
                  onMouseUp={handleImageMouseUp}
                  onMouseLeave={handleImageMouseUp}
                  onMouseMove={handleImageMouseMove}
                >
                  <div className="split-badge badge-after">
                    {convertedImageUrl ? `◀ CONVERTED (.${targetFormat.toUpperCase()})` : `◀ TARGET (.${targetFormat.toUpperCase()})`}
                  </div>
                  <div className="split-badge badge-before">ORIGINAL ({imageFileName.split('.').pop()?.toUpperCase()}) ▶</div>

                  {/* Left layer (Original) */}
                  <img
                    src={originalImageUrl}
                    alt="Original"
                    className="image-preview-img"
                  />

                  {/* Right layer (Converted / Target) */}
                  <div
                    className="split-layer-right"
                    style={{ clipPath: `polygon(${imageSplitPos}% 0, 100% 0, 100% 100%, ${imageSplitPos}% 100%)` }}
                  >
                    <img
                      src={convertedImageUrl || originalImageUrl}
                      alt="Converted Preview"
                      className="image-preview-img"
                    />
                  </div>

                  {/* Split slider line */}
                  <div
                    className="split-divider-line"
                    style={{ left: `${imageSplitPos}%` }}
                  >
                    <div className="split-handle-btn">
                      <span className="handle-label handle-label-after">AFTER</span>
                      ‹ ›
                      <span className="handle-label handle-label-before">BEFORE</span>
                    </div>
                  </div>
                </div>

                <div className="info-stats-row">
                  <div className="info-stat-group">
                    <span className="info-stat-title">Source ({imageFileName.split('.').pop()?.toUpperCase()})</span>
                    <span className="info-stat-sub">
                      {imgOrigWidth > 0 ? `${imgOrigWidth}×${imgOrigHeight} • ` : ''}{imageOrigFormatted}
                    </span>
                  </div>

                  {imageConvertDone && convertedImageUrl && (
                    <button
                      onClick={handleDownloadConvertedImage}
                      className="btn-download-success"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: 13, cursor: 'pointer' }}
                    >
                      <Download size={14} />
                      Download {targetFormat.toUpperCase()} ({imageConvertedFormatted})
                    </button>
                  )}

                  <div className="info-stat-group" style={{ textAlign: 'right' }}>
                    <span className="info-stat-title">
                      Converted ({targetFormat.toUpperCase()})
                    </span>
                    <span className="info-stat-sub">
                      {targetWidth && targetHeight ? `${targetWidth}×${targetHeight} • ` : ''}
                      {imageConvertedFormatted || 'Ready to Convert'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>
        </main>
      )}

      {/* ══════════════════════════════════════════════════════════
         VIDEO COMPRESSOR INTERFACE (Original)
         ══════════════════════════════════════════════════════════ */}
      {appMode === 'video' && (
        <main className={`app-body mobile-step-${mobileStep}`}>
          {/* Mobile Step Wizard */}
          <div className="mobile-step-wizard">
            <div
              className={`wizard-step ${mobileStep === 1 ? 'active' : ''} ${mobileStep > 1 ? 'completed' : ''}`}
              onClick={() => setMobileStep(1)}
            >
              <div className="step-badge">{mobileStep > 1 ? <Check size={12} /> : '1'}</div>
              <span className="step-label">1. Select</span>
            </div>
            <div className="wizard-line" />
            <div
              className={`wizard-step ${mobileStep === 2 ? 'active' : ''} ${mobileStep > 2 ? 'completed' : ''}`}
              onClick={() => { if (customVideoUrl) setMobileStep(2); }}
            >
              <div className="step-badge">{mobileStep > 2 ? <Check size={12} /> : '2'}</div>
              <span className="step-label">2. Presets</span>
            </div>
            <div className="wizard-line" />
            <div
              className={`wizard-step ${mobileStep === 3 ? 'active' : ''}`}
              onClick={() => { if (isCompressing || compressDone) setMobileStep(3); }}
            >
              <div className="step-badge">3</div>
              <span className="step-label">3. Download</span>
            </div>
          </div>

          {/* Left Options Panel */}
          <section className="options-panel">
            <h2 className="options-title">
              <ChevronLeft size={24} className="options-title-icon" onClick={() => setCustomVideoUrl(null)} />
              Compression Options
            </h2>

            {/* Resolution Card */}
            <div className="setting-card">
              <div className="setting-label">Resolution</div>
              <div
                className="dropdown-trigger"
                onClick={() => setIsResDropdownOpen(!isResDropdownOpen)}
              >
                <span className="dropdown-text">{selectedResolution.name.split(' ')[0]}</span>
                <ChevronDown size={18} style={{ color: '#64748B' }} />
              </div>

              {isResDropdownOpen && (
                <div className="dropdown-menu">
                  {RESOLUTIONS.map((res) => (
                    <div
                      key={res.name}
                      className={`dropdown-option ${res.name === selectedResolution.name ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedResolution(res);
                        setIsResDropdownOpen(false);
                      }}
                    >
                      <span>{res.name}</span>
                      {res.name === selectedResolution.name && <Check size={14} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quality Trade-off CRF Presets */}
            <div className="setting-card">
              <div className="setting-card-header">
                <span className="setting-label">Quality Preset Trade-off</span>
              </div>
              <div className="quality-presets-grid" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className={`preset-btn ${qualityPreset === 'visually-lossless' ? 'active' : ''}`}
                  onClick={() => setQualityPreset('visually-lossless')}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1.5px solid ${qualityPreset === 'visually-lossless' ? '#0066FF' : '#CBD5E1'}`,
                    background: qualityPreset === 'visually-lossless' ? '#EFF6FF' : '#FFF',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>✨ Visually Lossless</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Highest visual fidelity (CRF 18-24)</div>
                </button>

                <button
                  type="button"
                  className={`preset-btn ${qualityPreset === 'balanced' ? 'active' : ''}`}
                  onClick={() => setQualityPreset('balanced')}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1.5px solid ${qualityPreset === 'balanced' ? '#0066FF' : '#CBD5E1'}`,
                    background: qualityPreset === 'balanced' ? '#EFF6FF' : '#FFF',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>⚡ Balanced (Recommended)</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Optimal size vs quality (CRF 23-32)</div>
                </button>

                <button
                  type="button"
                  className={`preset-btn ${qualityPreset === 'max-compression' ? 'active' : ''}`}
                  onClick={() => setQualityPreset('max-compression')}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: `1.5px solid ${qualityPreset === 'max-compression' ? '#0066FF' : '#CBD5E1'}`,
                    background: qualityPreset === 'max-compression' ? '#EFF6FF' : '#FFF',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>📦 Maximum Compression</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Smallest payload file size (CRF 28-40)</div>
                </button>
              </div>

              <div
                className="advance-toggle"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ marginTop: 12 }}
              >
                <span>{showAdvanced ? '- Hide Advanced Settings' : '+ Advanced Codec Options'}</span>
              </div>

              {showAdvanced && (
                <div className="advanced-panel" style={{ marginTop: 8 }}>
                  <div className="form-group">
                    <label className="form-label">Encoder Codec</label>
                    <select
                      className="form-select"
                      value={codec}
                      onChange={(e) => setCodec(e.target.value as any)}
                    >
                      <option value="h265">H.265 / HEVC (Recommended)</option>
                      <option value="h264">H.264 / AVC (High Compatibility)</option>
                      <option value="av1">AV1 (Next-Gen Ultra)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginTop: 8 }}>
                    <label className="form-label">Audio Bitrate</label>
                    <select
                      className="form-select"
                      value={audioBitrate}
                      onChange={(e) => setAudioBitrate(Number(e.target.value))}
                    >
                      <option value={128}>128 kbps (Standard)</option>
                      <option value={192}>192 kbps (High Quality)</option>
                      <option value={320}>320 kbps (Lossless)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Size Summary */}
            <div className="summary-block">
              <span className="summary-label">Estimated Output Size</span>
              <div className="summary-size-wrapper">
                <span className="summary-size-main">{calculatedReducedSizeMB}MB</span>
                {originalSizeBytes > 0 && <span className="summary-size-old">{originalSizeMB}MB</span>}
              </div>
              {originalSizeBytes > 0 && (
                <span className="summary-savings-tag">
                  Almost {reducedDiffMB}MB saved
                </span>
              )}
            </div>

            {/* Compress Button */}
            <button
              className="btn-compress"
              onClick={handleStartCompression}
              disabled={isCompressing || !customVideoUrl}
            >
              {isCompressing ? (
                <>
                  <RotateCw size={18} className="animate-spin-fast" />
                  {jobStatusText} ({compressProgress}%)
                </>
              ) : compressDone ? (
                <>
                  <Check size={18} />
                  Compression Complete!
                </>
              ) : (
                <>
                  Compress File (Rust FFmpeg)
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            {customVideoUrl && (
              <div className="selected-file-card">
                <div className="file-info-group">
                  <div className="file-icon-badge">
                    <Film size={18} />
                  </div>
                  <div className="file-details">
                    <span className="file-name-text" title={fileName}>{fileName}</span>
                    <span className="file-size-badge">{originalSizeMB} MB</span>
                  </div>
                </div>
                <button
                  className="btn-change-video"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={12} />
                  Change Video
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />

            {compressDone && (
              <div className="thank-you-card">
                <div className="thank-you-header">
                  <div className="thank-you-badge">
                    <Sparkles size={24} style={{ color: '#166534' }} />
                  </div>
                  <h3 className="thank-you-title">🎉 Video Encoded Successfully</h3>
                  <p className="thank-you-subtext">
                    Reduced from <strong>{originalSizeMB} MB</strong> to <strong>{calculatedReducedSizeMB} MB</strong>
                  </p>
                </div>

                <div className="thank-you-actions">
                  <button
                    onClick={handleDownloadCompressed}
                    className="btn-download-primary"
                  >
                    <Sparkles size={18} />
                    Download MP4 ({calculatedReducedSizeMB}MB)
                  </button>
                  <button
                    onClick={handleResetAll}
                    className="btn-reset-step"
                  >
                    <RotateCw size={14} />
                    Compress Another Video
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Right Preview Card */}
          <section className="preview-card">
            {!customVideoUrl ? (
              <div
                className={`upload-dropzone ${isDraggingOver ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="upload-icon-wrapper">
                  <UploadCloud size={36} />
                </div>
                <div className="upload-headline">Upload your video to compress</div>
                <div className="upload-subtext">
                  Upload video files up to 60 MB. Files stream safely to disk in chunks.
                </div>

                <div className="dropzone-credibility-bar">
                  <div className="cred-stat-item">
                    <Eye size={15} style={{ color: '#0066FF' }} />
                    <span><strong>{pageViewsCount.toLocaleString()}</strong> Page Visitors</span>
                  </div>
                  <div className="cred-stat-divider">|</div>
                  <div className="cred-stat-item">
                    <Video size={15} style={{ color: '#16A34A' }} />
                    <span><strong>{videosCompressedCount.toLocaleString()}</strong> Videos Compressed</span>
                  </div>
                </div>

                <button className="btn-select-file">
                  Select Video File
                </button>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px' }}>
                  Supports MP4, MOV, AVI, MKV, WebM (Any Resolution)
                </div>
              </div>
            ) : (
              <>
                <div
                  ref={splitContainerRef}
                  className="split-view-container"
                  onMouseDown={handleMouseDown}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onMouseMove={handleMouseMove}
                >
                  <div className="split-badge badge-after">
                    {compressedVideoUrl ? '◀ AFTER (Redis FFmpeg Worker Output)' : '◀ AFTER (Preview Filter)'}
                  </div>
                  <div className="split-badge badge-before">BEFORE (Original) ▶</div>

                  <video
                    ref={videoOrigRef}
                    src={customVideoUrl}
                    className="split-video-layer"
                    autoPlay
                    loop
                    muted
                    onLoadedMetadata={(e) => {
                      setDuration(e.currentTarget.duration || 0);
                    }}
                    onTimeUpdate={(e) => {
                      setCurrentTime(e.currentTarget.currentTime);
                    }}
                  />

                  <div
                    className="split-layer-right"
                    style={{ clipPath: `polygon(${splitPos}% 0, 100% 0, 100% 100%, ${splitPos}% 100%)` }}
                  >
                    <video
                      ref={videoCompRef}
                      src={compressedVideoUrl || customVideoUrl}
                      className="split-video-right"
                      autoPlay
                      loop
                      muted
                    />
                  </div>

                  <div
                    className="split-divider-line"
                    style={{ left: `${splitPos}%` }}
                  >
                    <div className="split-handle-btn">
                      <span className="handle-label handle-label-after">AFTER</span>
                      ‹ ›
                      <span className="handle-label handle-label-before">BEFORE</span>
                    </div>
                  </div>

                  <div
                    className="edit-video-badge"
                    onClick={() => alert("Edit Video Trimmer opened!")}
                  >
                    <Scissors size={14} />
                    Edit Video
                  </div>
                </div>

                <div className="info-stats-row">
                  <div className="info-stat-group">
                    <span className="info-stat-title">Source Video</span>
                    <span className="info-stat-sub">Size: {originalSizeMB}MB</span>
                  </div>

                  {compressDone && compressedVideoUrl && (
                    <button
                      onClick={handleDownloadCompressed}
                      className="btn-download-success"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: 13, cursor: 'pointer' }}
                    >
                      <Upload size={14} style={{ transform: 'rotate(180deg)' }} />
                      Download Encoded MP4 ({calculatedReducedSizeMB}MB)
                    </button>
                  )}

                  <div className="info-stat-group" style={{ textAlign: 'right' }}>
                    <span className="info-stat-title">
                      {compressedVideoUrl ? 'Compressed Video' : 'Compressed Video (Estimated)'}
                    </span>
                    <span className="info-stat-sub">Size: {calculatedReducedSizeMB}MB</span>
                  </div>
                </div>

                <div className="player-controls-bar">
                  <button
                    className="btn-play-pause"
                    onClick={togglePlay}
                  >
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                  </button>

                  <span className="player-time">{formatTime(currentTime)}</span>

                  <div
                    className="player-seek-track"
                    onClick={(e) => {
                      if (videoOrigRef.current && videoCompRef.current && duration > 0) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const newTime = (clickX / rect.width) * duration;
                        videoOrigRef.current.currentTime = newTime;
                        videoCompRef.current.currentTime = newTime;
                        setCurrentTime(newTime);
                      }
                    }}
                  >
                    <div
                      className="player-seek-fill"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>

                  <span className="player-time">{formatTime(duration)}</span>

                  <Volume2 size={16} style={{ color: '#64748B', cursor: 'pointer' }} />
                  <Maximize2 size={15} style={{ color: '#64748B', cursor: 'pointer' }} />
                </div>
              </>
            )}
          </section>
        </main>
      )}

      {/* Mobile Sticky Bar */}
      <div className="mobile-sticky-bar">
        {appMode === 'image' ? (
          mobileStep === 1 || !originalImageUrl ? (
            <button
              className="mobile-action-btn primary"
              onClick={() => imageFileInputRef.current?.click()}
            >
              <ImageIcon size={20} />
              <span>Step 1: Select Image File</span>
            </button>
          ) : isConvertingImage ? (
            <button className="mobile-action-btn processing" disabled>
              <RotateCw size={20} className="animate-spin-fast" />
              <span>Converting Image to {targetFormat.toUpperCase()}...</span>
            </button>
          ) : imageConvertDone ? (
            <button
              className="mobile-action-btn success"
              onClick={handleDownloadConvertedImage}
            >
              <Download size={20} />
              <span>Download {targetFormat.toUpperCase()} ({imageConvertedFormatted})</span>
            </button>
          ) : (
            <button
              className="mobile-action-btn compress-now"
              onClick={handleStartImageConversion}
            >
              <Zap size={20} />
              <span>Convert to {targetFormat.toUpperCase()} Now</span>
            </button>
          )
        ) : (
          mobileStep === 1 || !customVideoUrl ? (
            <button
              className="mobile-action-btn primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={20} />
              <span>Step 1: Select Video File</span>
            </button>
          ) : isCompressing ? (
            <button className="mobile-action-btn processing" disabled>
              <RotateCw size={20} className="animate-spin-fast" />
              <span>Step 3: {jobStatusText} ({compressProgress}%)...</span>
            </button>
          ) : compressDone ? (
            <button
              className="mobile-action-btn success"
              onClick={handleDownloadCompressed}
            >
              <Sparkles size={20} />
              <span>Step 3: Download Encoded MP4 ({calculatedReducedSizeMB}MB)</span>
            </button>
          ) : (
            <button
              className="mobile-action-btn compress-now"
              onClick={handleStartCompression}
            >
              <Zap size={20} />
              <span>Step 2: Compress Video Now</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default App;
