import React from "react";

interface SlotifyLogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "light" | "dark";
  className?: string;
}

const SlotifyLogo: React.FC<SlotifyLogoProps> = ({
  size = "md",
  variant = "dark",
  className = "",
}) => {
  // Size mappings for font-size and bar dimensions (all in em for scalability)
  const sizeConfig = {
    sm: {
      fontSize: "0.875rem", // ~14px base
      barHeight: "1.1em", // Main bar height (slightly taller than text)
      sideBarHeight: "0.75em", // Side bars height (shorter than main)
      barWidth: "0.12em", // Bar width
      gap: "0.2em", // Gap between center bar and side bars
      borderRadius: "0.06em",
    },
    md: {
      fontSize: "1.5rem", // ~24px base
      barHeight: "1.1em",
      sideBarHeight: "0.75em",
      barWidth: "0.12em",
      gap: "0.2em",
      borderRadius: "0.06em",
    },
    lg: {
      fontSize: "3rem", // ~48px base
      barHeight: "1.1em",
      sideBarHeight: "0.75em",
      barWidth: "0.12em",
      gap: "0.2em",
      borderRadius: "0.06em",
    },
  };

  const config = sizeConfig[size];
  const textColor = variant === "light" ? "#f6efe6" : "#231f1a";

  // Calculate positions: center bar is where "l" would be, side bars flank it
  const centerBarLeft = `calc(${config.barWidth} + ${config.gap})`;
  const totalWidth = `calc(${config.barWidth} + ${config.gap} + ${config.barWidth} + ${config.gap} + ${config.barWidth})`;

  return (
    <span
      className={`slotify-logo ${className}`}
      aria-label="Slotify"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontFamily: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: config.fontSize,
        fontWeight: 600,
        color: textColor,
        letterSpacing: "0.02em",
        lineHeight: 1,
      }}
    >
      {/* "S" */}
      <span style={{ display: "inline-block" }}>S</span>
      
      {/* "l" with soundwave bars - positioned to replace the "l" character */}
      <span
        style={{
          position: "relative",
          display: "inline-block",
          width: totalWidth,
          height: config.barHeight,
          marginLeft: "0.05em",
          marginRight: "0.05em",
          verticalAlign: "baseline",
        }}
      >
        {/* Left side bar */}
        <svg
          width={config.barWidth}
          height={config.sideBarHeight}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
          }}
          aria-hidden="true"
        >
          <rect
            width="100%"
            height="100%"
            rx={config.borderRadius}
            ry={config.borderRadius}
            fill={textColor}
          />
        </svg>

        {/* Main "l" bar (centered, replaces the "l" stroke) */}
        <svg
          width={config.barWidth}
          height={config.barHeight}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            left: centerBarLeft,
            bottom: 0,
          }}
          aria-hidden="true"
        >
          <rect
            width="100%"
            height="100%"
            rx={config.borderRadius}
            ry={config.borderRadius}
            fill={textColor}
          />
        </svg>

        {/* Right side bar */}
        <svg
          width={config.barWidth}
          height={config.sideBarHeight}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
          }}
          aria-hidden="true"
        >
          <rect
            width="100%"
            height="100%"
            rx={config.borderRadius}
            ry={config.borderRadius}
            fill={textColor}
          />
        </svg>
      </span>

      {/* "otify" */}
      <span style={{ display: "inline-block" }}>otify</span>
    </span>
  );
};

export default SlotifyLogo;
