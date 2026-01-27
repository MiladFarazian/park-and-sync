import { logger } from '@/lib/logger';

const log = logger.scope('compressImage');

/**
 * Compress images client-side before upload
 * Target: max 1280px width/height, ~0.75 quality
 */
export async function compressImage(file: File): Promise<File> {
  // Skip compression for videos or already small files
  if (!file.type.startsWith('image/') || file.size < 500000) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    img.onload = () => {
      // Calculate new dimensions (max 1280px)
      let { width, height } = img;
      const maxDim = 1280;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          
          // Only use compressed if it's actually smaller
          if (blob.size < file.size) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            log.debug(`[PERF] Compressed ${file.size} → ${compressedFile.size} bytes (${Math.round(100 - (compressedFile.size / file.size) * 100)}% reduction)`);
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        file.type,
        0.75
      );
    };

    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}
