import { ImageResponse } from "next/og";

/** Square PNG app icon: the flame on the brand green. For the manifest and notifications. */
export function appIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#13795B",
        }}
      >
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
          <path
            d="M12 1.5c.9 3.6 5.2 5.9 5.2 11a5.2 5.2 0 0 1-10.4 0c0-2.2 1-3.6 2.1-4.7.3 1.4 1 2.2 1.8 2.5C10.2 7.5 10.6 4.2 12 1.5z"
            fill="#F2780C"
          />
          <path
            d="M12 22a3 3 0 0 1-3-3c0-1.7 1.4-2.5 2-4 .4.8 1 1.2 1.6 1.2C12.2 14.6 13.6 13.6 13.8 12.8 14.7 14 15 15.2 15 19a3 3 0 0 1-3 3z"
            fill="#FFD27A"
          />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
