import React from 'react';

interface ClinicStageBackdropProps {
  isAlert?: boolean;
  isListening?: boolean;
}

export const ClinicStageBackdrop: React.FC<ClinicStageBackdropProps> = ({
  isAlert = false,
  isListening = false,
}) => {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* Clean clinical wall atmosphere */}
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{
          background: isAlert
            ? 'linear-gradient(180deg, #fff5f5 0%, #f7f9fc 64%, #e9eef5 100%)'
            : isListening
              ? 'linear-gradient(180deg, #eef7ff 0%, #f5f9fe 64%, #e8eff8 100%)'
              : 'linear-gradient(180deg, #f3f7fc 0%, #f8fafd 62%, #e9eff6 100%)',
        }}
      />

      {/* Architectural clinic interior SVG (frosted sunlit window, minimal medical cross & shelf, clean plant) */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 800 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="clinic-sunbeam" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#e0f2fe" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="clinic-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e4ebf3" />
            <stop offset="100%" stopColor="#d8e2ee" />
          </linearGradient>
          <linearGradient id="clinic-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eef7ff" />
            <stop offset="100%" stopColor="#dcebfa" />
          </linearGradient>
        </defs>

        {/* Left architectural frosted window */}
        <g opacity="0.88">
          <rect
            x="48"
            y="84"
            width="178"
            height="340"
            rx="16"
            fill="url(#clinic-glass)"
            stroke="#d4dfec"
            strokeWidth="3"
          />
          <line x1="137" y1="84" x2="137" y2="424" stroke="#d4dfec" strokeWidth="2.5" />
          <line x1="48" y1="210" x2="226" y2="210" stroke="#d4dfec" strokeWidth="2.5" />
          <line x1="48" y1="320" x2="226" y2="320" stroke="#d4dfec" strokeWidth="2.5" />
          {/* Soft morning light ray */}
          <polygon points="226,84 560,340 560,680 226,424" fill="url(#clinic-sunbeam)" />
        </g>

        {/* Subtle wall acoustic panel lines */}
        <line x1="0" y1="670" x2="800" y2="670" stroke="#cfd9e6" strokeWidth="2" />
        <rect x="0" y="670" width="800" height="230" fill="url(#clinic-floor)" />
        <rect x="0" y="662" width="800" height="10" fill="#eef3f8" />

        {/* Right minimalist clinic shelf + subtle medical emblem + indoor plant */}
        <g opacity="0.9">
          {/* Wall framed subtle clinic emblem */}
          <rect
            x="578"
            y="142"
            width="136"
            height="164"
            rx="14"
            fill="#ffffff"
            fillOpacity="0.82"
            stroke="#dbe4ef"
            strokeWidth="2"
          />
          <circle cx="646" cy="212" r="28" fill="#e8f3ff" />
          <path
            d="M646 198 V226 M632 212 H660"
            stroke="#3898ec"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <line x1="606" y1="264" x2="686" y2="264" stroke="#d9e3ef" strokeWidth="3" strokeLinecap="round" />
          <line x1="620" y1="278" x2="672" y2="278" stroke="#e4ecf5" strokeWidth="3" strokeLinecap="round" />

          {/* Clean floating shelf */}
          <rect x="556" y="388" width="188" height="10" rx="5" fill="#dfe7f1" />
          {/* Ceramic vase & leaves */}
          <path d="M674 388 L680 350 H710 L716 388 Z" fill="#ffffff" stroke="#d4dfec" strokeWidth="1.5" />
          <path
            d="M695 350 C682 325 668 318 666 298 C684 304 694 322 695 350 Z"
            fill="#9cd2c6"
          />
          <path
            d="M696 350 C710 322 726 316 728 294 C710 300 698 320 696 350 Z"
            fill="#7ec2b3"
          />
          <path
            d="M695 350 C695 322 694 300 696 282 C704 298 704 322 695 350 Z"
            fill="#b3dfd5"
          />
          {/* Small medical file binders on shelf */}
          <rect x="576" y="346" width="16" height="42" rx="3" fill="#dbeafe" stroke="#bfdbfe" strokeWidth="1" />
          <rect x="596" y="352" width="16" height="36" rx="3" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
        </g>
      </svg>

      {/* Ambient radial spotlight behind the robot */}
      <div
        className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 h-[380px] w-[380px] rounded-full transition-all duration-500"
        style={{
          background: isListening
            ? 'radial-gradient(circle, rgba(58, 160, 255, 0.20) 0%, rgba(58, 160, 255, 0) 70%)'
            : isAlert
              ? 'radial-gradient(circle, rgba(239, 68, 68, 0.14) 0%, rgba(239, 68, 68, 0) 70%)'
              : 'radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0) 72%)',
        }}
      />
    </div>
  );
};
