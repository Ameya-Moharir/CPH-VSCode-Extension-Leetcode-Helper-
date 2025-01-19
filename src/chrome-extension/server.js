// server.js
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const app = express();

app.use(cors());
app.use(express.json());

// Handle incoming requests from Chrome extension
app.post('/fetch-test-cases', (req, res) => {
  const { url } = req.body;
  
  if (!url || !url.startsWith('https://leetcode.com/problems/')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid LeetCode URL'
    });
  }

  // Create a leetcode-helper:// URL
  const protocolUrl = `leetcode-helper://fetch?url=${encodeURIComponent(url)}`;
  
  // Open the URL using the default system handler
  if (process.platform === 'win32') {
    exec(`start ${protocolUrl}`);
  } else if (process.platform === 'darwin') {
    exec(`open "${protocolUrl}"`);
  } else {
    exec(`xdg-open "${protocolUrl}"`);
  }

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});