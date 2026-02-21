const form = document.getElementById('uploadForm');
const status = document.getElementById('status');
const result = document.getElementById('result');
const videoList = document.getElementById('videoList');
const segmentCheckbox = document.getElementById('segmentCheckbox');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status.textContent = 'Uploading...';
  result.style.display = 'none';

  const input = document.getElementById('videoInput');
  if (!input.files || input.files.length === 0) return;

  const formData = new FormData();
  formData.append('video', input.files[0]);

  try {
    formData.append('segment', segmentCheckbox.checked ? 'true' : 'false');

    const resp = await fetch('/analyze-video', { method: 'POST', body: formData });
    if (!resp.ok) {
      const err = await resp.json();
      status.textContent = 'Error: ' + (err.error || resp.statusText);
      return;
    }

    const json = await resp.json();
    if (json.videoUrls && Array.isArray(json.videoUrls)) {
      status.textContent = 'Processing finished.';
      videoList.innerHTML = '';
      json.videoUrls.forEach((u) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = u;
        a.textContent = u;
        a.target = '_blank';
        li.appendChild(a);
        videoList.appendChild(li);
      });
      result.style.display = '';
    } else {
      status.textContent = 'No videos returned.';
    }
  } catch (err) {
    status.textContent = 'Upload failed: ' + err.message;
  }
});
