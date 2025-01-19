document.addEventListener('DOMContentLoaded', function() {
    const fetchButton = document.getElementById('fetchButton');
    const errorDiv = document.getElementById('error');

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const url = tabs[0].url;
        if (!url.startsWith('https://leetcode.com/problems/')) {
            fetchButton.disabled = true;
            errorDiv.textContent = 'Please navigate to a LeetCode problem page';
            errorDiv.style.display = 'block';
        }
    });

    fetchButton.addEventListener('click', async function() {
        try {
            // First try to read the port from the temp file
            const response = await fetch('http://localhost:3000/get-extension-port');
            const { port } = await response.json();
            
            if (!port) {
                throw new Error('Could not determine VS Code extension port');
            }

            // Now use the correct port to fetch test cases
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            const url = tabs[0].url;
            
            const fetchResponse = await fetch(`http://localhost:${port}/fetch-test-cases`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: url })
            });
            
            const data = await fetchResponse.json();
            if (data.success) {
                window.close();
            } else {
                throw new Error(data.error || 'Failed to fetch test cases');
            }
        } catch (error) {
            errorDiv.textContent = 'VS Code extension not running. Please open VS Code.';
            errorDiv.style.display = 'block';
        }
    });
});