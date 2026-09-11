import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const uploadRouter = Router();

const UPLOADS_DIR = path.join(__dirname, '../../../data/uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 1. Upload Base64 Image (Device photo, intake inspection, parts proof)
uploadRouter.post('/image', (req: Request, res: Response) => {
  const { data, filename, category } = req.body;
  if (!data) return res.status(400).json({ error: 'Image data is required' });

  try {
    // Expected format: data:image/png;base64,... or raw base64
    const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer: Buffer;
    let ext = '.jpg';

    if (matches && matches.length === 3) {
      const mime = matches[1];
      ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(data, 'base64');
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    }

    const savedFilename = `${category || 'img'}-${uuidv4().substring(0, 8)}${ext}`;
    const filePath = path.join(UPLOADS_DIR, savedFilename);

    fs.writeFileSync(filePath, buffer);

    res.status(201).json({
      success: true,
      filename: savedFilename,
      url: `/api/uploads/${savedFilename}`,
      sizeBytes: buffer.length
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save image', details: err.message });
  }
});

// 2. Serve Static Uploaded File
uploadRouter.get('/:filename', (req: Request, res: Response) => {
  const safeFilename = path.basename(req.params.filename as string);
  const filePath = path.join(UPLOADS_DIR, safeFilename);


  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});
