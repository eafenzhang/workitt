import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';
import { initDB, getDb } from './db/index.js';
import requirementsRouter from './routes/requirements.js';
import mcpRouter from './routes/mcp.js';
import modelsRouter from './routes/models.js';
import dashboardRouter from './routes/dashboard.js';
import insightsRouter from './routes/insights.js';
import documentsRouter from './routes/documents.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve frontend static files (production build)
const distPath = resolve(__dirname, '../../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log('[API] Serving frontend from', distPath);
}

// Static files for uploads
const uploadsDir = path.join(__dirname, './static/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Root
app.get('/', (req, res) => res.send('Agent Wiki API Running'));

// Storage stats (only count files referenced by documents)
app.get('/api/storage/stats', (req, res) => {
  try {
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ usedBytes: 0, totalBytes: 0 });
    }
    // Get all file_paths from documents that reference uploads
    const db = getDb();
    const rows = db.exec("SELECT file_path FROM documents WHERE file_path != ''")[0]?.values || [];
    const validFiles = new Set(rows.map(r => path.basename(r[0])));

    let usedBytes = 0;
    const allFiles = fs.readdirSync(uploadsDir);
    for (const file of allFiles) {
      if (validFiles.has(file)) {
        const stat = fs.statSync(path.join(uploadsDir, file));
        usedBytes += stat.size;
      }
    }
    res.json({ usedBytes, totalBytes: usedBytes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check (used by Electron to wait for backend readiness)
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ========== Requirements ==========
app.use('/api/requirements', requirementsRouter);
app.post('/api/requirements/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ========== Documents (upload before router to avoid /:id conflict) ==========
app.post('/api/documents/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
});
app.use('/api/documents', documentsRouter);

// ========== MCP Servers ==========
app.use('/api/mcp', mcpRouter);

// ========== Models ==========
app.use('/api/models', modelsRouter);

// ========== Dashboard / Insights ==========
app.use('/api/dashboard', dashboardRouter);
app.use('/api/insights', insightsRouter);

async function start() {
  await initDB();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, '0.0.0.0', () => console.log(`[API] Server running at http://0.0.0.0:${PORT}`));
}

start();