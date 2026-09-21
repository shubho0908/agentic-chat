import { PdfImageMime } from "./document";
export interface RasterSize {
  width: number;
  height: number;
}

function readPngSize(buffer: Buffer): RasterSize | null {
  const PNG_SIGNATURE = 0x89504e47;
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== PNG_SIGNATURE) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegSize(buffer: Buffer): RasterSize | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

export function readRasterSize(buffer: Buffer, mimeType: string): RasterSize | null {
  if (mimeType === PdfImageMime.PNG) return readPngSize(buffer);
  if (mimeType === PdfImageMime.JPEG) return readJpegSize(buffer);
  return null;
}
