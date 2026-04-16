import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
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
export async function uploadBase64ToCloudinary(base64: string, filename: string): Promise<string> {
  console.log('[Cloudinary] Uploading base64 image:', filename);
  try {
    const dataUri = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
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

export async function uploadBufferToCloudinary(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  console.log('[Cloudinary] Uploading buffer:', filename, mimeType);
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: filename.split('.')[0],
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) return reject(error);
        if (result) return resolve(result.secure_url);
        reject(new Error("Unknown error during cloudinary upload"));
      }
    );
    uploadStream.end(buffer);
  });
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
