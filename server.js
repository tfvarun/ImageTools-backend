const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve raw assets for frontend (logos, images)
app.use('/assets', express.static(path.join(__dirname, 'client', 'assets')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
const outputDir = path.join(__dirname, 'output');

[uploadsDir, outputDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Serve resized output files for direct download
app.use('/output', express.static(outputDir));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg|heic|jfif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Helper function to get image format
const getImageFormat = (filename) => {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'jfif') return 'jpeg';
  if (ext === 'heic') return 'heic';
  return ext;
};

// Helper function to clean up old files
const cleanupFile = (filePath) => {
  setTimeout(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }, 60000); // Delete after 1 minute
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get available conversion formats for an uploaded file
app.post('/api/get-conversion-options', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputFormat = getImageFormat(req.file.filename);
    let availableFormats = [];

    switch (inputFormat) {
      case 'png':
        availableFormats = ['jpg', 'jpeg', 'webp', 'svg'];
        break;
      case 'jpeg':
        availableFormats = ['png', 'webp'];
        break;
      case 'jpg':
        availableFormats = ['png', 'webp'];
        break;
      case 'webp':
        availableFormats = ['png', 'jpg', 'jpeg'];
        break;
      case 'jfif':
        availableFormats = ['png'];
        break;
      case 'heic':
        availableFormats = ['jpg', 'png'];
        break;
      case 'svg':
        availableFormats = ['png', 'jpg'];
        break;
      default:
        availableFormats = ['png', 'jpg', 'webp'];
    }

    // Clean up uploaded file
    cleanupFile(req.file.path);

    res.json({ 
      inputFormat,
      availableFormats: Array.from(new Set(availableFormats.map(f => (f === 'jpeg' ? 'jpg' : f))))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Convert image
app.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { targetFormat } = req.body;
    if (!targetFormat) {
      return res.status(400).json({ error: 'Target format not specified' });
    }

    const inputPath = req.file.path;
    const outputFilename = `converted-${Date.now()}.${targetFormat}`;
    const outputPath = path.join(outputDir, outputFilename);

    let sharpInstance = sharp(inputPath);

    // Handle HEIC format (requires special handling)
    const inputFormat = getImageFormat(req.file.filename);
    if (inputFormat === 'heic') {
      sharpInstance = sharp(inputPath, { failOnError: false });
    }

    // Convert to target format
    if (targetFormat === 'svg') {
      // PNG to SVG conversion (simplified - creates a basic SVG wrapper)
      const metadata = await sharpInstance.metadata();
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${metadata.width}" height="${metadata.height}">
        <image href="data:image/png;base64,${(await sharpInstance.png().toBuffer()).toString('base64')}" width="${metadata.width}" height="${metadata.height}"/>
      </svg>`;
      fs.writeFileSync(outputPath, svgContent);
    } else {
      await sharpInstance.toFormat(targetFormat === 'jpg' ? 'jpeg' : targetFormat)
        .toFile(outputPath);
    }

    // Send file
    res.download(outputPath, outputFilename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up files
      cleanupFile(inputPath);
      cleanupFile(outputPath);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resize image
app.post('/api/resize', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { width, height, maintainAspectRatio } = req.body;
    const targetWidth = parseInt(width);
    const targetHeight = parseInt(height);
    const maintainRatio = maintainAspectRatio === 'true' || maintainAspectRatio === true;

    if (!targetWidth || !targetHeight) {
      return res.status(400).json({ error: 'Width and height are required' });
    }

    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname).replace('.', '');
    const outputFilename = `resized-${Date.now()}.${ext}`;
    const outputPath = path.join(outputDir, outputFilename);

    let sharpInstance = sharp(inputPath);

    if (maintainRatio) {
      sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    } else {
      sharpInstance = sharpInstance.resize(targetWidth, targetHeight);
    }

    await sharpInstance.toFile(outputPath);

    res.download(outputPath, outputFilename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      cleanupFile(inputPath);
      cleanupFile(outputPath);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk resize
app.post('/api/bulk-resize', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { width, height } = req.body;
    const targetWidth = parseInt(width);
    const targetHeight = parseInt(height);

    if (!targetWidth || !targetHeight) {
      return res.status(400).json({ error: 'Width and height are required' });
    }

    const results = [];

    for (const file of req.files) {
      const inputPath = file.path;
      const outputFilename = `resized-${Date.now()}-${file.originalname}`;
      const outputPath = path.join(outputDir, outputFilename);

      let sharpInstance = sharp(inputPath);
      sharpInstance = sharpInstance.resize(targetWidth, targetHeight);

      await sharpInstance.toFile(outputPath);
      results.push({
        originalName: file.originalname,
        filename: outputFilename,
        path: outputPath
      });
    }
    // Respond with JSON containing URLs for each resized file
 // FORCE HTTPS for production (Render)
const baseUrl = `https://${req.get('host')}`;

const filesPayload = results.map(r => ({
  name: r.filename,
  url: `${baseUrl}/output/${encodeURIComponent(r.filename)}`
}));


    // Schedule cleanup of uploaded and output files
    req.files.forEach(file => cleanupFile(file.path));
    results.forEach(result => cleanupFile(result.path));

    res.json({ files: filesPayload });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crop image
app.post('/api/crop', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

  const { x, y, width, height } = req.body;
  let cropX = parseInt(x);
  let cropY = parseInt(y);
  let cropWidth = parseInt(width);
  let cropHeight = parseInt(height);

  if ([cropX, cropY, cropWidth, cropHeight].some(v => Number.isNaN(v))) {
    return res.status(400).json({ error: 'Invalid crop parameters' });
  }
  cropX = Math.max(0, cropX);
  cropY = Math.max(0, cropY);
  if (cropWidth <= 0 || cropHeight <= 0) {
    return res.status(400).json({ error: 'Width and height must be > 0' });
  }

    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname).replace('.', '');
    const outputFilename = `cropped-${Date.now()}.${ext}`;
    const outputPath = path.join(outputDir, outputFilename);

  const meta = await sharp(inputPath).metadata();
  const maxW = Math.max(1, meta.width || 1);
  const maxH = Math.max(1, meta.height || 1);
  if (cropX >= maxW || cropY >= maxH) {
    return res.status(400).json({ error: 'Crop area out of bounds' });
  }
  const safeWidth = Math.max(1, Math.min(cropWidth, maxW - cropX));
  const safeHeight = Math.max(1, Math.min(cropHeight, maxH - cropY));

  await sharp(inputPath)
    .extract({ left: cropX, top: cropY, width: safeWidth, height: safeHeight })
    .toFile(outputPath);

    res.download(outputPath, outputFilename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      cleanupFile(inputPath);
      cleanupFile(outputPath);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compress image (reduce file size while keeping same format when possible)
app.post('/api/compress', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputPath = req.file.path;
    const inputExt = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const srcFormat = getImageFormat(req.file.originalname);
    const q = Math.max(10, Math.min(100, parseInt(req.body.quality) || 70));
    const maxSizeKbRaw = req.body.maxSizeKb;
    const targetBytes = maxSizeKbRaw ? Math.max(1, parseInt(maxSizeKbRaw)) * 1024 : null;

    let outFormat = srcFormat;
    if (srcFormat === 'heic' || srcFormat === 'svg') {
      outFormat = 'jpeg';
    }
    if (srcFormat === 'gif') {
      // GIF encoding not supported by sharp; convert to webp for compression
      outFormat = 'webp';
    }

    const outputFilename = `compressed-${Date.now()}.${outFormat}`;
    const outputPath = path.join(outputDir, outputFilename);

    let image = sharp(inputPath);
    if (srcFormat === 'heic') {
      image = sharp(inputPath, { failOnError: false });
    }

    if (targetBytes) {
      let fmt = outFormat;
      if (fmt === 'png') fmt = 'webp';
      let low = 10;
      let high = 100;
      let bestBuf = null;
      let bestQ = null;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        let buf;
        if (fmt === 'jpeg') {
          buf = await image.jpeg({ quality: mid }).toBuffer();
        } else if (fmt === 'webp') {
          buf = await image.webp({ quality: mid }).toBuffer();
        } else {
          buf = await image.toFormat(fmt).toBuffer();
        }
        if (buf.length <= targetBytes) {
          bestBuf = buf;
          bestQ = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (bestBuf) {
        fs.writeFileSync(outputPath, bestBuf);
        outFormat = fmt;
      } else {
        if (fmt === 'jpeg') {
          await image.jpeg({ quality: 10 }).toFile(outputPath);
        } else if (fmt === 'webp') {
          await image.webp({ quality: 10 }).toFile(outputPath);
        } else {
          await image.toFormat(fmt).toFile(outputPath);
        }
        outFormat = fmt;
      }
    } else {
      if (outFormat === 'jpeg') {
        await image.jpeg({ quality: q }).toFile(outputPath);
      } else if (outFormat === 'png') {
        await image.png({ compressionLevel: 9, palette: true }).toFile(outputPath);
      } else if (outFormat === 'webp') {
        await image.webp({ quality: q }).toFile(outputPath);
      } else {
        await image.toFormat(outFormat).toFile(outputPath);
      }
    }

    res.download(outputPath, outputFilename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      cleanupFile(inputPath);
      cleanupFile(outputPath);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compression preview: return estimated output bytes without sending the image
app.post('/api/compress-preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const srcFormat = getImageFormat(req.file.originalname);
    const q = Math.max(10, Math.min(100, parseInt(req.body.quality) || 70));
    const maxSizeKbRaw = req.body.maxSizeKb;
    const targetBytes = maxSizeKbRaw ? Math.max(1, parseInt(maxSizeKbRaw)) * 1024 : null;
    let outFormat = srcFormat;
    if (srcFormat === 'heic' || srcFormat === 'svg') outFormat = 'jpeg';
    if (srcFormat === 'gif') outFormat = 'webp';

    let image = sharp(req.file.path);
    if (srcFormat === 'heic') {
      image = sharp(req.file.path, { failOnError: false });
    }

    let buf;
    if (targetBytes) {
      let fmt = outFormat;
      if (fmt === 'png') fmt = 'webp';
      let low = 10;
      let high = 100;
      let bestBuf = null;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        let b;
        if (fmt === 'jpeg') {
          b = await image.jpeg({ quality: mid }).toBuffer();
        } else if (fmt === 'webp') {
          b = await image.webp({ quality: mid }).toBuffer();
        } else {
          b = await image.toFormat(fmt).toBuffer();
        }
        if (b.length <= targetBytes) {
          bestBuf = b;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      buf = bestBuf || (outFormat === 'jpeg' ? await image.jpeg({ quality: 10 }).toBuffer()
        : outFormat === 'webp' ? await image.webp({ quality: 10 }).toBuffer()
        : await image.toFormat(fmt).toBuffer());
      outFormat = fmt;
    } else {
      if (outFormat === 'jpeg') {
        buf = await image.jpeg({ quality: q }).toBuffer();
      } else if (outFormat === 'png') {
        buf = await image.png({ compressionLevel: 9, palette: true }).toBuffer();
      } else if (outFormat === 'webp') {
        buf = await image.webp({ quality: q }).toBuffer();
      } else {
        buf = await image.toFormat(outFormat).toBuffer();
      }
    }

    const bytes = buf.length;
    // Clean up uploaded temp file
    cleanupFile(req.file.path);
    res.json({ bytes, format: outFormat });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// // Serve static files from React app
// if (process.env.NODE_ENV === 'production') {
//   app.use(express.static(path.join(__dirname, 'client/build')));
  
//   app.get('*', (req, res) => {
//     res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
//   });
// }

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
