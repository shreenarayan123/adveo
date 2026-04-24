import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 120_000,  // 120s — default was too short for large video uploads
});

// For MVP, mock image upload (if called from client side with File object)
export async function uploadImage(file: File): Promise<string> {
  // Client-side uploads to Cloudinary usually require a signed preset.
  // For MVP, if this is called from client, we return a mock or handle via API route.
  return 'https://dummyimage.com/uploaded.png';
}

export async function saveFinalVideo(projectId: string, url: string) {
  return true;
}

// --- Cloudinary Upload Helpers ---
function inferMimeTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

export async function uploadBase64ToCloudinary(base64: string, filename: string): Promise<string> {
  const mimeType = inferMimeTypeFromFilename(filename);
  console.log('[Cloudinary] Uploading base64 asset:', filename, mimeType);
  try {
    const dataUri = base64.startsWith('data:') ? base64 : `data:${mimeType};base64,${base64}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      public_id: filename.split('.')[0],
      resource_type: 'auto'
    });
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading base64 to Cloudinary:', error);
    throw error;
  }
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  attempt = 1
): Promise<string> {
  console.log(`[Cloudinary] Uploading buffer: ${filename} ${mimeType} (attempt ${attempt})`);
  try {
    return await new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: filename.split('.')[0], resource_type: 'auto' },
        (error, result) => {
          if (error) return reject(error);
          if (result) return resolve(result.secure_url);
          reject(new Error('Unknown error during cloudinary upload'));
        }
      );
      uploadStream.end(buffer);
    });
  } catch (error: any) {
    const isTimeout = error?.http_code === 499 || /timeout/i.test(error?.message ?? '');
    if (isTimeout && attempt < 3) {
      const wait = attempt * 3_000;
      console.warn(`[Cloudinary] Timeout on attempt ${attempt}, retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
      return uploadBufferToCloudinary(buffer, filename, mimeType, attempt + 1);
    }
    console.error('Upload error:', error);
    throw error;
  }
}

export async function uploadFileToCloudinary(filePath: string, filename: string): Promise<string> {
  console.log('[Cloudinary] Uploading file:', filePath, filename);
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      public_id: filename.split('.')[0],
      resource_type: 'auto'
    });
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading file to Cloudinary:', error);
    throw error;
  }
}
