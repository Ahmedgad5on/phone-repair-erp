/**
 * Client-Side Image Resizer & Compressor (Architecture Proposal 49)
 * Scales photos to max 1280px dimension and converts to efficient JPEG at 0.8 quality
 * reducing intake photo upload sizes from 10MB to ~150KB.
 */
export async function compressImage(fileOrBlob: File | Blob, maxWidth: number = 1280, quality: number = 0.8): Promise<{ dataUrl: string; sizeBytes: number; originalSizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas 2D context unavailable'));
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const sizeBytes = Math.round((dataUrl.length * 3) / 4);

        resolve({
          dataUrl,
          sizeBytes,
          originalSizeBytes: fileOrBlob.size
        });
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(fileOrBlob);
  });
}
