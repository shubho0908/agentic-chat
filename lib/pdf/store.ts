import { UTApi } from "uploadthing/server";
// uploadthing@7's UTApi reads its own deprecated `url`/`appUrl` getters
// internally even though we only consume `ufsUrl`; drop just that noise.
import "@/lib/uploadthing-warnings";

export interface StoredPdf {
  url: string;
  name: string;
  size: number;
}

export async function storePdf(buffer: Buffer, fileName: string): Promise<StoredPdf> {
  const utapi = new UTApi();
  const file = new File([new Uint8Array(buffer)], fileName, { type: "application/pdf" });
  const response = await utapi.uploadFiles(file);
  if (response.error) {
    throw new Error(response.error.message || "PDF upload failed");
  }
  // Prefer ufsUrl (v9 canonical). `data.url` is a plain string on the UTApi
  // result (no deprecation getter), so the fallback read is warning-free.
  const url = response.data.ufsUrl || response.data.url;
  return { url, name: fileName, size: buffer.length };
}
