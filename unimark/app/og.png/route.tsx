import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { ICON_PATHS, LOGO_VIEWBOX, WORDMARK_PATHS } from "@/components/brand/logo-paths";
import { hero } from "@/content/home";

// The social sharing card (Open Graph / Twitter), rendered once at build time to out/og.png.
// A route (rather than the opengraph-image convention) gives the file a .png extension,
// so any static host serves it with the right content type.
export const dynamic = "force-static";

const size = { width: 1200, height: 630 };

const fontFile = (weight: number) =>
  readFile(path.join(process.cwd(), `node_modules/@fontsource/montserrat/files/montserrat-latin-${weight}-normal.woff`));

export async function GET() {
  const [extraBold, medium, screen] = await Promise.all([
    fontFile(800),
    fontFile(500),
    sharp(path.join(process.cwd(), "public/screens/discover-653.webp")).png().toBuffer(),
  ]);
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}"><g fill="#00AAB2">${ICON_PATHS.map((d) => `<path d="${d}"/>`).join("")}</g><g fill="#F7F7F7">${WORDMARK_PATHS.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1B1C28", position: "relative", overflow: "hidden", fontFamily: "Montserrat" }}>
        <div
          style={{
            position: "absolute",
            right: -120,
            top: 80,
            width: 640,
            height: 640,
            borderRadius: 9999,
            background: "radial-gradient(circle, rgba(0,170,178,0.38) 0%, rgba(0,170,178,0) 68%)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 0 72px 80px", width: 720 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse, not a browser */}
          <img src={`data:image/svg+xml;base64,${Buffer.from(logo).toString("base64")}`} width={226} height={50} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 800, color: "#F7F7F7", letterSpacing: -3, lineHeight: 1.02 }}>{hero.titleLead}</div>
            <div style={{ fontSize: 76, fontWeight: 800, color: "#00AAB2", letterSpacing: -3, lineHeight: 1.02 }}>{hero.titleAccent}</div>
            <div style={{ marginTop: 28, fontSize: 28, fontWeight: 500, color: "rgba(247,247,247,0.78)", lineHeight: 1.4, maxWidth: 600 }}>{hero.lead}</div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            right: 90,
            top: 70,
            display: "flex",
            padding: 11,
            borderRadius: 60,
            background: "#1f2030",
            border: "2px solid rgba(255,255,255,0.16)",
            transform: "rotate(6deg)",
            boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse, not a browser */}
          <img src={`data:image/png;base64,${screen.toString("base64")}`} width={300} height={653} style={{ borderRadius: 48 }} alt="" />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Montserrat", data: extraBold, weight: 800, style: "normal" },
        { name: "Montserrat", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
