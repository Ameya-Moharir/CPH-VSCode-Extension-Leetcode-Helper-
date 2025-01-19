const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
app.use(cors());

app.get('/get-extension-port', (req, res) => {
    try {
        const portFile = path.join(os.tmpdir(), 'leetcode-helper-port.txt');
        console.log('Bridge Server: Checking for port file at:', portFile);
        
        if (!fs.existsSync(portFile)) {
            console.log('Bridge Server: Port file does not exist');
            return res.status(500).json({ error: 'VS Code extension not running - port file not found' });
        }
        
        const port = fs.readFileSync(portFile, 'utf8');
        console.log('Bridge Server: Found port:', port);
        res.json({ port: parseInt(port) });
    } catch (error) {
        console.error('Bridge Server: Error details:', error);
        res.status(500).json({ error: `VS Code extension not running - ${error.message}` });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Bridge server running on port ${PORT}`);
});