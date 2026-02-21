const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const cors = require('cors');

ffmpeg.setFfmpegPath(ffmpegStatic.path || ffmpegStatic);

const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads') });

const PORT = process.env.PORT || 3000;
const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_WORKSPACE = process.env.ROBOFLOW_WORKSPACE || 'doorknobyolo';
const ROBOFLOW_WORKFLOW = process.env.ROBOFLOW_WORKFLOW || 'find-hands-floors-shoes-buckets-and-bottles';

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/analyze-video', upload.single('video'), async (req, res) => {
  if (!ROBOFLOW_API_KEY) {
    return res.status(500).json({ error: 'Missing ROBOFLOW_API_KEY environment variable' });
  }

  if (!req.file) return res.status(400).json({ error: 'No video uploaded' });

  const videoPath = req.file.path;
  const name = path.parse(req.file.originalname).name + '-' + Date.now();
  const baseUploads = path.join(__dirname, 'uploads');
  const baseOutputs = path.join(__dirname, 'outputs');
  fs.mkdirSync(baseUploads, { recursive: true });
  fs.mkdirSync(baseOutputs, { recursive: true });

  const shouldSegment = req.body && (req.body.segment === 'true' || req.body.segment === 'on' || req.body.segment === '1');

  // helper to call Roboflow on frames in a folder and assemble into a video
  async function processFramesToVideo(framesDir, processedDir, outVideoPath) {
    fs.mkdirSync(processedDir, { recursive: true });
    const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const filePath = path.join(framesDir, f);
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');

      const url = `https://serverless.roboflow.com/${ROBOFLOW_WORKSPACE}/workflows/${ROBOFLOW_WORKFLOW}`;

      const body = {
        api_key: ROBOFLOW_API_KEY,
        inputs: { image: { type: 'base64', value: base64 } }
      };

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          console.error('Roboflow error', await response.text());
          fs.writeFileSync(path.join(processedDir, f), buffer);
          continue;
        }

        const json = await response.json();
        const vis = json.outputs && json.outputs[0] && json.outputs[0].visualization && json.outputs[0].visualization.value;
        if (vis) {
          const visBuffer = Buffer.from(vis, 'base64');
          fs.writeFileSync(path.join(processedDir, f), visBuffer);
        } else {
          fs.writeFileSync(path.join(processedDir, f), buffer);
        }
      } catch (err) {
        console.error('Error calling Roboflow', err);
        fs.writeFileSync(path.join(processedDir, f), buffer);
      }
    }

    const processedFiles = fs.readdirSync(processedDir).filter(f => f.endsWith('.jpg')).sort();
    if (processedFiles.length === 0) {
      throw new Error('No processed frames found to assemble');
    }

    return await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(processedDir, 'frame-%04d.jpg'))
        .inputOptions(['-framerate 5'])
        .outputOptions(['-c:v libx264', '-pix_fmt yuv420p'])
        .save(outVideoPath)
        .on('end', () => resolve(outVideoPath))
        .on('error', (err) => reject(err));
    });
  }

  if (shouldSegment) {
    const segmentsDir = path.join(baseUploads, `${name}-segs`);
    fs.mkdirSync(segmentsDir, { recursive: true });

    // split into 10s segments
    ffmpeg(videoPath)
      .outputOptions(['-f', 'segment', '-segment_time', '10', '-reset_timestamps', '1'])
      .output(path.join(segmentsDir, 'segment-%03d.mp4'))
      .on('end', async () => {
        try {
          const segFiles = fs.readdirSync(segmentsDir).filter(f => f.endsWith('.mp4')).sort();
          const urls = [];

          for (let i = 0; i < segFiles.length; i++) {
            const seg = segFiles[i];
            const segPath = path.join(segmentsDir, seg);
            const framesDir = path.join(baseUploads, `${name}-seg-${i}-frames`);
            const processedDir = path.join(baseOutputs, `${name}-seg-${i}-frames`);
            const outVideoPath = path.join(baseOutputs, `${name}-segment-${i}-processed.mp4`);

            fs.mkdirSync(framesDir, { recursive: true });

            // extract frames from this segment
            await new Promise((resolve, reject) => {
              ffmpeg(segPath)
                .outputOptions(['-vf', 'fps=5'])
                .output(path.join(framesDir, 'frame-%04d.jpg'))
                .on('end', resolve)
                .on('error', reject)
                .run();
            });

            await processFramesToVideo(framesDir, processedDir, outVideoPath);
            urls.push(`/outputs/${path.basename(outVideoPath)}`);
          }

          // optional cleanup: remove original uploaded file
          try { fs.unlinkSync(videoPath); } catch (e) {}

          res.json({ videoUrls: urls });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: 'Segment processing error' });
        }
      })
      .on('error', (err) => {
        console.error('FFmpeg split error', err);
        res.status(500).json({ error: 'Failed to split video into segments' });
      })
      .run();

    return;
  }

  // default: process entire video as single item
  const framesDir = path.join(baseUploads, `${name}-frames`);
  const processedDir = path.join(baseOutputs, `${name}-frames`);
  const outVideoPath = path.join(baseOutputs, `${name}-processed.mp4`);

  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(processedDir, { recursive: true });

  ffmpeg(videoPath)
    .outputOptions(['-vf', 'fps=5'])
    .output(path.join(framesDir, 'frame-%04d.jpg'))
    .on('end', async () => {
      try {
        await processFramesToVideo(framesDir, processedDir, outVideoPath);
        try { fs.unlinkSync(videoPath); } catch (e) {}
        res.json({ videoUrls: [`/outputs/${path.basename(outVideoPath)}`] });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Processing error' });
      }
    })
    .on('error', (err) => {
      console.error('FFmpeg extract error', err);
      res.status(500).json({ error: 'Failed to extract frames' });
    })
    .run();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Ensure ROBOFLOW_API_KEY is set in the environment before using.');
});
