# Roboflow Video Demo

This small demo accepts a video upload, extracts frames, sends frames to a Roboflow workflow for visualization, and returns a processed video.

Prereqs
- Node.js 18+ (for built-in features), or any Node 14+ with dependencies installed
- ffmpeg (bundled via `ffmpeg-static` dependency)

Setup

1. In the project root install dependencies:

```bash
cd /Users/shaheenbhattacharya/hackathon_project
npm install
```

2. Set your Roboflow API key in environment:

macOS / Linux:

```bash
export ROBOFLOW_API_KEY=your_api_key_here
```

3. Start the server:

```bash
npm start
```

4. Open http://localhost:3000 and upload a video. The server will process frames (at 5 fps by default) and return a processed video.

Notes
- Do not commit your API key; use the `ROBOFLOW_API_KEY` env var.
- The demo processes frames sequentially; for large videos or production use, add concurrency/rate-limiting and batching.
- If Roboflow doesn't return a visualization for a frame, the original frame will be used as a fallback.
