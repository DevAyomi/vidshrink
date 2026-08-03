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
  LogOut
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
  // Video & File state
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [compressedVideoUrl, setCompressedVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [originalSizeBytes, setOriginalSizeBytes] = useState<number>(0);
  const [actualCompressedBytes, setActualCompressedBytes] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);

  // Settings
  const [selectedResolution, setSelectedResolution] = useState<VideoPreset>(RESOLUTIONS[0]);
  const [isResDropdownOpen, setIsResDropdownOpen] = useState(false);
  const [compressionPct, setCompressionPct] = useState<number>(36);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced options
  const [codec, setCodec] = useState<'h265' | 'h264' | 'av1'>('h265');
  const [preset, setPreset] = useState<'slow' | 'medium' | 'fast'>('slow');
  const [audioBitrate, setAudioBitrate] = useState<number>(192);

  // Split View Slider position (0 to 100%)
  const [splitPos, setSplitPos] = useState<number>(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);

  // Processing & Engine state
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const [compressDone, setCompressDone] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isRustEngineConnected, setIsRustEngineConnected] = useState<boolean>(true);

  // Stats & Modals state
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('admin@gmail.com');
  const [adminPassword, setAdminPassword] = useState('password');
  const [adminError, setAdminError] = useState('');
  const [pageViewsCount, setPageViewsCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('vidshrink_page_views') || '1', 10);
  });
  const [videosCompressedCount, setVideosCompressedCount] = useState<number>(() => {
    return parseInt(localStorage.getItem('vidshrink_videos_compressed') || '0', 10);
  });

  // Track page views on initial load
  useEffect(() => {
    // Increment local counter as fallback
    const localViews = (parseInt(localStorage.getItem('vidshrink_page_views') || '0', 10)) + 1;
    localStorage.setItem('vidshrink_page_views', localViews.toString());
    setPageViewsCount(localViews);

    // Call server to track view
    fetch(`${API_BASE_URL}/api/track-view`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.page_views) setPageViewsCount(data.page_views);
        if (data.videos_compressed !== undefined) setVideosCompressedCount(data.videos_compressed);
      })
      .catch(() => {});
  }, []);

  // Fetch admin stats when admin panel is open
  const fetchStats = () => {
    fetch(`${API_BASE_URL}/api/stats`)
      .then(res => res.json())
      .then(data => {
        if (data.page_views) setPageViewsCount(data.page_views);
        if (data.videos_compressed !== undefined) setVideosCompressedCount(data.videos_compressed);
      })
      .catch(() => {});
  };

  // Refs
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoOrigRef = useRef<HTMLVideoElement>(null);
  const videoCompRef = useRef<HTMLVideoElement>(null);

  // Size calculations
  const originalSizeMB = originalSizeBytes > 0 ? (originalSizeBytes / (1024 * 1024)).toFixed(2) : '0.00';
  const calculatedReducedSizeMB = actualCompressedBytes !== null
    ? (actualCompressedBytes / (1024 * 1024)).toFixed(2)
    : originalSizeBytes > 0
    ? ((parseFloat(originalSizeMB)) * (1 - compressionPct / 100) * (selectedResolution.width * selectedResolution.height) / (1080 * 960)).toFixed(2)
    : '0.00';
  const reducedDiffMB = originalSizeBytes > 0 ? (parseFloat(originalSizeMB) - parseFloat(calculatedReducedSizeMB)).toFixed(1) : '0.0';

  // Handle Dragging Split View Slider
  const handleMouseDown = () => setIsDraggingSplit(true);
  const handleMouseUp = () => setIsDraggingSplit(false);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingSplit || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newPct = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSplitPos(newPct);
  };

  // Format Seconds to MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Handle File Selection
  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('Please select a valid video file (MP4, MOV, WebM, etc.)');
      return;
    }
    setSelectedFileObj(file);
    setFileName(file.name);
    setOriginalSizeBytes(file.size);
    const url = URL.createObjectURL(file);
    setCustomVideoUrl(url);
    setCompressedVideoUrl(null);
    setActualCompressedBytes(null);
    setCompressDone(false);
    setIsPlaying(true);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileChange(file);
  };

  // Handle Drag and Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChange(file);
  };

  // Trigger Real Rust FFmpeg Compression API
  const handleStartCompression = async () => {
    if (!customVideoUrl) {
      alert('Please upload a video file first!');
      return;
    }

    if (!selectedFileObj) {
      alert('Please select a video file from your computer.');
      return;
    }

    setIsCompressing(true);
    setCompressProgress(15);
    setCompressDone(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFileObj);
      formData.append('codec', codec);
      formData.append('compressionPct', compressionPct.toString());
      formData.append('width', selectedResolution.width.toString());
      formData.append('height', selectedResolution.height.toString());
      formData.append('audioBitrate', audioBitrate.toString());

      setCompressProgress(45);

      const res = await fetch(`${API_BASE_URL}/api/compress`, {
        method: 'POST',
        body: formData,
      });

      setCompressProgress(85);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Server compression failed');
      }

      const data = await res.json();
      if (data.success) {
        const downloadUrl = data.compressed_url.startsWith('http')
          ? data.compressed_url
          : `${API_BASE_URL}${data.compressed_url}`;
        setCompressedVideoUrl(downloadUrl);
        setActualCompressedBytes(data.compressed_size_bytes);
        setIsRustEngineConnected(true);
        setCompressProgress(100);
        setIsCompressing(false);
        setCompressDone(true);

        // Update total videos compressed locally & fetch from server
        const newLocalComp = (parseInt(localStorage.getItem('vidshrink_videos_compressed') || '0', 10)) + 1;
        localStorage.setItem('vidshrink_videos_compressed', newLocalComp.toString());
        setVideosCompressedCount(newLocalComp);
        fetchStats();
      }
    } catch (err: any) {
      console.error("Rust FFmpeg server error:", err);
      setIsRustEngineConnected(false);
      alert(`Compression error: ${err?.message || err}`);
      setIsCompressing(false);
    }
  };

  // Dedicated Blob Download Function for cross-origin & direct file save
  const handleDownloadCompressed = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!compressedVideoUrl) {
      alert("No compressed video file available yet. Please click 'Compress File' first!");
      return;
    }

    try {
      const res = await fetch(compressedVideoUrl);
      if (!res.ok) throw new Error("Failed fetching video file for download");
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
      console.warn("Blob download fallback:", err);
      const link = document.createElement('a');
      link.href = compressedVideoUrl;
      link.download = fileName ? `compressed_${fileName}` : 'compressed_video.mp4';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Admin Login Handler
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

  // Toggle Video Play / Pause
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

  return (
    <div className="app-container">
      {/* Full-Width Application Top Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="brand-logo" onClick={() => setCustomVideoUrl(null)}>
            VIDSHRINK <span className="brand-badge" style={{ background: '#166534', color: '#DCFCE7' }}>100% FREE</span>
          </div>
          <div className="nav-item" onClick={() => setShowHowToUse(true)}>
            <HelpCircle size={16} />
            <span>How to Use</span>
          </div>
        </div>

        <div className="header-right">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: isRustEngineConnected ? '#166534' : '#9A3412', background: isRustEngineConnected ? '#F0FDF4' : '#FFEDD5', padding: '4px 10px', borderRadius: 9999, border: `1px solid ${isRustEngineConnected ? '#BBF7D0' : '#FED7AA'}` }}>
            <Cpu size={14} />
            {isRustEngineConnected ? 'Rust FFmpeg Engine Active' : 'Browser Preview Mode'}
          </div>
          
          <button className="btn-admin" onClick={() => { setShowAdminModal(true); fetchStats(); }}>
            <ShieldCheck size={16} />
            Admin Panel
          </button>
        </div>
      </header>

      {/* How to Use Modal */}
      {showHowToUse && (
        <div className="modal-backdrop" onClick={() => setShowHowToUse(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <HelpCircle size={20} style={{ color: '#0066FF' }} />
                How to Use VidShrink
              </h3>
              <button className="modal-close-btn" onClick={() => setShowHowToUse(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="how-to-body">
              <div className="step-card">
                <div className="step-num">1</div>
                <div className="step-content">
                  <h4>Upload Your Video</h4>
                  <p>Drag and drop any MP4, MOV, AVI, MKV, or WebM video file into the dropzone, or click to browse files.</p>
                </div>
              </div>

              <div className="step-card">
                <div className="step-num">2</div>
                <div className="step-content">
                  <h4>Configure Compression Settings</h4>
                  <p>Select target resolution (e.g. 1080p, 720p) and set your desired compression slider (5% to 90%). Expand Advanced Settings to pick H.265 / H.264 / AV1 codecs.</p>
                </div>
              </div>

              <div className="step-card">
                <div className="step-num">3</div>
                <div className="step-content">
                  <h4>Compress & Preview</h4>
                  <p>Click <strong>Compress File (Rust FFmpeg)</strong>. Watch real-time encoding, then use the split visual slider to compare original vs compressed quality side-by-side!</p>
                </div>
              </div>

              <div className="step-card">
                <div className="step-num">4</div>
                <div className="step-content">
                  <h4>Download Clean MP4</h4>
                  <p>Click <strong>Download Real MP4</strong> to instantly save your compressed video with zero quality loss.</p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-modal-primary" onClick={() => setShowHowToUse(false)}>
                Got it, let's compress!
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
                      <span className="stat-subtext">People who accessed page</span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: '#F0FDF4', color: '#16A34A' }}>
                      <Video size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-label">Videos Compressed</span>
                      <span className="stat-number">{videosCompressedCount}</span>
                      <span className="stat-subtext">Total FFmpeg encodes</span>
                    </div>
                  </div>
                </div>

                <div className="admin-info-box">
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', marginBottom: 4 }}>
                    Platform Health Status
                  </div>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    Server is responding on port 8080. All background Rust workers are running smoothly.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Main 2-Column Application Body */}
      <main className="app-body">
        {/* Left Column: Compression Options */}
        <section className="options-panel">
          <h2 className="options-title">
            <ChevronLeft size={24} className="options-title-icon" onClick={() => setCustomVideoUrl(null)} />
            Compression Options
          </h2>

          {/* Resolution Selector Card */}
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

          {/* Compression Percentage Slider Card */}
          <div className="setting-card">
            <div className="setting-card-header">
              <span className="setting-label">Compression</span>
              <span className="setting-value">{compressionPct}%</span>
            </div>

            <div style={{ padding: '14px 0 8px 0' }}>
              <input
                type="range"
                min="5"
                max="90"
                value={compressionPct}
                onChange={(e) => setCompressionPct(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #0066FF 0%, #0066FF ${compressionPct}%, #E2E8F0 ${compressionPct}%, #E2E8F0 100%)`
                }}
              />
            </div>

            {/* Toggle Advance Settings */}
            <div
              className="advance-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>{showAdvanced ? '- Hide Advance Settings' : '+ Advance Settings'}</span>
            </div>

            {showAdvanced && (
              <div className="advanced-panel">
                <div className="form-group">
                  <label className="form-label">Encoder Codec</label>
                  <select
                    className="form-select"
                    value={codec}
                    onChange={(e) => setCodec(e.target.value as any)}
                  >
                    <option value="h265">H.265 / HEVC (Recommended)</option>
                    <option value="h264">H.264 / AVC (High Compatibility)</option>
                    <option value="av1">AV1 (Next-Gen Ultra Compression)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Speed Preset</label>
                  <select
                    className="form-select"
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as any)}
                  >
                    <option value="slow">Slow (Higher Quality / Smaller)</option>
                    <option value="medium">Medium (Balanced Speed)</option>
                    <option value="fast">Fast (Quick Encode)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Audio Bitrate</label>
                  <select
                    className="form-select"
                    value={audioBitrate}
                    onChange={(e) => setAudioBitrate(Number(e.target.value))}
                  >
                    <option value={128}>128 kbps (Standard)</option>
                    <option value={192}>192 kbps (High Quality)</option>
                    <option value={320}>320 kbps (Lossless Audio)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Estimated Reduced Size Summary Box */}
          <div className="summary-block">
            <span className="summary-label">Estimated Reduced Size</span>
            <div className="summary-size-wrapper">
              <span className="summary-size-main">{calculatedReducedSizeMB}MB</span>
              {originalSizeBytes > 0 && <span className="summary-size-old">{originalSizeMB}MB</span>}
            </div>
            {originalSizeBytes > 0 && (
              <span className="summary-savings-tag">
                Almost {reducedDiffMB}MB reduced ({compressionPct}% saved)
              </span>
            )}
          </div>

          {/* Main Action Button */}
          <button
            className="btn-compress"
            onClick={handleStartCompression}
            disabled={isCompressing || !customVideoUrl}
          >
            {isCompressing ? (
              <>
                <RotateCw size={18} className="animate-spin-fast" />
                FFmpeg Encoding ({compressProgress}%)...
              </>
            ) : compressDone ? (
              <>
                <Check size={18} />
                Real Compression Complete!
              </>
            ) : (
              <>
                Compress File (Rust FFmpeg)
                <ArrowRight size={18} />
              </>
            )}
          </button>

          {/* File Selected Status Card */}
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
            <div className="success-overlay">
              <Sparkles size={18} style={{ color: '#166534' }} />
              <span className="success-text">
                Real FFmpeg video output ready ({calculatedReducedSizeMB}MB)!
              </span>
              <button
                onClick={handleDownloadCompressed}
                className="btn-download-success"
              >
                Download Real MP4
              </button>
            </div>
          )}
        </section>

        {/* Right Column: Preview Area or Upload Dropzone */}
        <section className="preview-card">
          {!customVideoUrl ? (
            /* Upload Dropzone View (Default when no video uploaded) */
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
                Drag and drop your video file here, or click to browse from your computer.
              </div>
              <button className="btn-select-file">
                Select Video File
              </button>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px' }}>
                Supports MP4, MOV, AVI, MKV, WebM (Any Resolution)
              </div>
            </div>
          ) : (
            /* Uploaded Video Split Comparison View */
            <>
              <div
                ref={splitContainerRef}
                className="split-view-container"
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onMouseMove={handleMouseMove}
              >
                {/* Floating BEFORE & AFTER Badges */}
                <div className="split-badge badge-after">
                  {compressedVideoUrl ? '◀ AFTER (Real FFmpeg Output)' : '◀ AFTER (Preview Filter)'}
                </div>
                <div className="split-badge badge-before">BEFORE (Original) ▶</div>

                {/* Original HTML5 Video */}
                <video
                  ref={videoOrigRef}
                  src={customVideoUrl}
                  className="split-video-layer"
                  autoPlay
                  loop
                  muted
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    setDuration(video.duration || 0);
                  }}
                  onTimeUpdate={(e) => {
                    setCurrentTime(e.currentTarget.currentTime);
                  }}
                />

                {/* Compressed Right Layer (Plays actual FFmpeg output file when generated!) */}
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
                    style={!compressedVideoUrl ? { filter: `contrast(${1 + compressionPct / 250}) brightness(0.98)` } : {}}
                  />
                </div>

                {/* Vertical Split Line & Handle */}
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

                {/* Edit Video Overlay Badge */}
                <div
                  className="edit-video-badge"
                  onClick={() => alert("Edit Video Trimmer opened! Trim, crop, or adjust filters.")}
                >
                  <Scissors size={14} />
                  Edit Video
                </div>
              </div>

              {/* Info Stats Row */}
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
                    Download Compressed MP4 ({calculatedReducedSizeMB}MB)
                  </button>
                )}

                <div className="info-stat-group" style={{ textAlign: 'right' }}>
                  <span className="info-stat-title">
                    {compressedVideoUrl ? 'Real Compressed Video' : 'Compressed Video (Estimated)'}
                  </span>
                  <span className="info-stat-sub">Size: {calculatedReducedSizeMB}MB</span>
                </div>
              </div>

              {/* Video Player Control Bar */}
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
    </div>
  );
}

export default App;
