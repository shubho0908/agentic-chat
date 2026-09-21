import { UTApi } from "uploadthing/server";

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
  return { url: response.data.ufsUrl, name: fileName, size: buffer.length };
}
