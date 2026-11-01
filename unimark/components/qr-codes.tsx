import QRCode from "qrcode";
import { site, type StoreId } from "@/content/site";

/** Rendered at build time to inline SVG; each code points at the verified store URL. */
async function qrSvg(url: string) {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#1B1C28", light: "#00000000" },
  });
}

export async function QrCodes({ className = "" }: { className?: string }) {
  const ids: StoreId[] = ["ios", "android"];
  const codes = await Promise.all(ids.map(async (id) => ({ id, svg: await qrSvg(site.stores[id].url) })));
  return (
    <ul className={`flex gap-4 ${className}`} aria-label="Scan to download">
      {codes.map(({ id, svg }) => (
        <li key={id} className="flex flex-col items-center gap-2.5 rounded-2xl bg-white p-3.5 pb-3 shadow-card">
          <div
            className="size-[6.5rem] [&>svg]:size-full"
            role="img"
            aria-label={`QR code linking to UniMark on ${site.stores[id].label}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <span className="text-[0.78rem] font-bold text-ink">Scan for {site.stores[id].device}</span>
        </li>
      ))}
    </ul>
  );
}
