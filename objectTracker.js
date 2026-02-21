const fs = require('fs');
const path = require('path');

// In-memory tracker for current session
class ObjectTracker {
  constructor() {
    this.trackedObjects = {};
    this.lastSeenFrame = {};
    this.objectCounts = {
      bucket: 0,
      floor: 0,
      shoe: 0,
      hand: 0,
      bottle: 0
    };
    this.dbPath = path.join(__dirname, 'data', 'object_counts.json');
    this.initDb();
  }

  initDb() {
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    if (fs.existsSync(this.dbPath)) {
      try {
        this.objectCounts = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
      } catch (e) {
        console.error('Error reading counts DB:', e);
      }
    }
  }

  saveDb() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.objectCounts, null, 2));
    } catch (e) {
      console.error('Error saving counts DB:', e);
    }
  }

  // Process detections from a single frame (called at 5 fps, so ~0.2s per frame)
  processFrame(frameNum, roboflowResult) {
    const framePredictions = roboflowResult.predictions || [];
    const detectedClasses = new Set();

    // Collect all detected class names in this frame
    framePredictions.forEach(pred => {
      if (pred.class) {
        detectedClasses.add(pred.class.toLowerCase());
      }
    });

    // Update last seen for detected objects
    detectedClasses.forEach(className => {
      this.lastSeenFrame[className] = frameNum;
    });

    // Check if any previously seen objects are now absent for > 2 seconds
    // At 5 fps, 2 seconds = ~10 frames
    const absenceThreshold = 10;

    Object.keys(this.lastSeenFrame).forEach(className => {
      const lastFrame = this.lastSeenFrame[className];
      const framesSinceLastSeen = frameNum - lastFrame;

      // If object was seen but now absent for > 2 seconds, increment count
      if (framesSinceLastSeen > absenceThreshold) {
        if (this.objectCounts.hasOwnProperty(className)) {
          this.objectCounts[className]++;
          console.log(`Object '${className}' left frame -> count now: ${this.objectCounts[className]}`);
        }
        delete this.lastSeenFrame[className];
      }
    });

    this.saveDb();
    return { ...this.objectCounts };
  }

  // Called at end of video to finalize any remaining tracked objects
  finalizeVideo() {
    // Any object that was seen during video gets incremented at end
    Object.keys(this.lastSeenFrame).forEach(className => {
      if (this.objectCounts.hasOwnProperty(className)) {
        this.objectCounts[className]++;
        console.log(`Object '${className}' finalized at end of video -> count now: ${this.objectCounts[className]}`);
      }
    });
    this.lastSeenFrame = {};
    this.saveDb();
  }

  resetCounts() {
    Object.keys(this.objectCounts).forEach(key => {
      this.objectCounts[key] = 0;
    });
    this.lastSeenFrame = {};
    this.saveDb();
  }

  getCounts() {
    return { ...this.objectCounts };
  }
}

module.exports = new ObjectTracker();
