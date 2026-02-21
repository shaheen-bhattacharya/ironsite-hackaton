const form = document.getElementById('uploadForm');
const status = document.getElementById('status');
const result = document.getElementById('result');
const videoList = document.getElementById('videoList');
const inputVideo = document.getElementById('inputVideo');
const segmentCheckbox = document.getElementById('segmentCheckbox');
const countsDisplay = document.getElementById('countsDisplay');
const resetCountsBtn = document.getElementById('resetCountsBtn');

// Display object counts
async function displayCounts(counts) {
  countsDisplay.innerHTML = '';
  Object.entries(counts).forEach(([key, val]) => {
    const div = document.createElement('div');
    div.className = 'count-item';
    div.innerHTML = `<strong>${key}</strong><div class="count-value">${val}</div>`;
    countsDisplay.appendChild(div);
  });
}

// Fetch and display current counts
async function refreshCounts() {
  try {
    const resp = await fetch('/api/counts');
    if (resp.ok) {
      const counts = await resp.json();
      displayCounts(counts);
    }
  } catch (err) {
    console.error('Error fetching counts:', err);
  }
}

// Reset counts
resetCountsBtn.addEventListener('click', async () => {
  if (confirm('Reset all object counts to 0?')) {
    try {
      const resp = await fetch('/api/reset-counts', { method: 'POST' });
      if (resp.ok) {
        const data = await resp.json();
        displayCounts(data.counts);
      }
    } catch (err) {
      alert('Error resetting counts: ' + err.message);
    }
  }
});

// Set status message with styling
function setStatus(message, type = 'loading') {
  console.log('[STATUS]', message);
  status.textContent = message;
  status.className = `status-message ${type}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('📤 Uploading and analyzing...', 'loading');
  result.style.display = 'none';

  const input = document.getElementById('videoInput');
  if (!input.files || input.files.length === 0) {
    setStatus('❌ Please select a video file', 'error');
    return;
  }

  // Create blob URL for uploaded video preview
  const file = input.files[0];
  console.log('File selected:', file.name, file.size, file.type);
  
  const blobUrl = URL.createObjectURL(file);
  console.log('Blob URL created:', blobUrl);
  
  inputVideo.src = blobUrl;
  console.log('Input video src set');

  const formData = new FormData();
  formData.append('video', file);
  formData.append('segment', segmentCheckbox.checked ? 'true' : 'false');

  try {
    console.log('Sending upload request...');
    const resp = await fetch('/analyze-video', { method: 'POST', body: formData });
    console.log('Upload response status:', resp.status);
    
    if (!resp.ok) {
      const err = await resp.json();
      console.error('Server error:', err);
      setStatus('❌ Error: ' + (err.error || resp.statusText), 'error');
      return;
    }

    const json = await resp.json();
    console.log('Response JSON:', json);
    
    if (json.videoUrls && Array.isArray(json.videoUrls)) {
      setStatus('✅ Processing finished!', 'success');
      videoList.innerHTML = '';
      
      json.videoUrls.forEach((u) => {
        const li = document.createElement('li');
        const div = document.createElement('div');
        div.className = 'video-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'video-item-name';
        nameSpan.textContent = '🎬 ' + u.split('/').pop();
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'video-item-actions';
        
        const downloadBtn = document.createElement('a');
        downloadBtn.href = u;
        downloadBtn.download = u.split('/').pop();
        downloadBtn.className = 'btn-download';
        downloadBtn.textContent = '⬇ Download';
        
        const playBtn = document.createElement('a');
        playBtn.href = u;
        playBtn.target = '_blank';
        playBtn.className = 'btn-download';
        playBtn.textContent = '▶ Play';
        
        actionsDiv.appendChild(playBtn);
        actionsDiv.appendChild(downloadBtn);
        
        div.appendChild(nameSpan);
        div.appendChild(actionsDiv);
        li.appendChild(div);
        videoList.appendChild(li);
      });
      
      // Display counts from response
      if (json.objectCounts) {
        displayCounts(json.objectCounts);
      }
      
      result.style.display = '';
      // Clear file input
      input.value = '';
    } else {
      setStatus('❌ No videos returned.', 'error');
    }
  } catch (err) {
    console.error('Fetch error:', err);
    setStatus('❌ Upload failed: ' + err.message, 'error');
  }
});

// Load counts on page load
window.addEventListener('load', refreshCounts);

// Demo button handler
document.getElementById('demoBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  setStatus('📥 Loading demo video...', 'loading');
  
  try {
    const resp = await fetch('/demo_trimmed_vid.mp4');
    const blob = await resp.blob();
    
    // Create a File from the blob
    const demoFile = new File([blob], 'demo_trimmed_vid.mp4', { type: 'video/mp4' });
    
    // Set the file in the input
    const fileInput = document.getElementById('videoInput');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(demoFile);
    fileInput.files = dataTransfer.files;
    
    // Show the video preview
    const blobUrl = URL.createObjectURL(blob);
    document.getElementById('inputVideo').src = blobUrl;
    
    setStatus('✅ Demo video loaded! Click "Upload & Analyze" to process', 'success');
  } catch (err) {
    console.error('Error loading demo:', err);
    setStatus('❌ Failed to load demo video: ' + err.message, 'error');
  }
});
