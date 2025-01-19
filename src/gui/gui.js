const vscode = require('vscode');

class GuiProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this._panel = null;
    }

    showResults(results) {
        if (this._panel) {
            this._panel.dispose();
        }

        this._panel = vscode.window.createWebviewPanel(
            'testResults',
            'Test Results',
            vscode.ViewColumn.Two,
            {
                enableScripts: true
            }
        );

        this._panel.webview.html = this._getHtmlContent(results);
    }

    _getHtmlContent(results) {
        const passedTests = results.filter(r => r.passed).length;
        const totalTests = results.length;
        const passRate = (passedTests / totalTests) * 100;

        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <style>
                        :root {
                            --vscode-bg: var(--vscode-editor-background);
                            --vscode-text: var(--vscode-editor-foreground);
                            --success-bg: rgba(35, 134, 54, 0.2);
                            --success-border: rgba(46, 160, 67, 0.4);
                            --failure-bg: rgba(248, 81, 73, 0.2);
                            --failure-border: rgba(248, 81, 73, 0.4);
                        }
                        
                        body {
                            padding: 20px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                            background-color: var(--vscode-bg);
                            color: var(--vscode-text);
                            line-height: 1.5;
                        }
                        
                        .summary {
                            background-color: var(--vscode-editor-background);
                            border: 1px solid var(--vscode-panel-border);
                            border-radius: 6px;
                            padding: 16px;
                            margin-bottom: 24px;
                            display: flex;
                            align-items: center;
                            gap: 12px;
                        }
                        
                        .progress-ring {
                            width: 60px;
                            height: 60px;
                        }
                        
                        .stats {
                            flex-grow: 1;
                        }
                        
                        .stats h2 {
                            margin: 0;
                            font-size: 1.4em;
                            color: var(--vscode-text);
                        }
                        
                        .stats p {
                            margin: 4px 0 0;
                            color: var(--vscode-textPreformat-foreground);
                        }
                        
                        .test-case {
                            margin-bottom: 16px;
                            border-radius: 6px;
                            overflow: hidden;
                        }
                        
                        .test-header {
                            padding: 12px 16px;
                            font-weight: 600;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        }
                        
                        .passed .test-header {
                            background-color: var(--success-bg);
                            border: 1px solid var(--success-border);
                        }
                        
                        .failed .test-header {
                            background-color: var(--failure-bg);
                            border: 1px solid var(--failure-border);
                        }
                        
                        .test-content {
                            background-color: var(--vscode-editor-background);
                            border: 1px solid var(--vscode-panel-border);
                            border-top: none;
                            padding: 16px;
                        }
                        
                        .test-section {
                            margin-bottom: 12px;
                        }
                        
                        .test-section:last-child {
                            margin-bottom: 0;
                        }
                        
                        .test-label {
                            font-weight: 600;
                            margin-bottom: 4px;
                            color: var(--vscode-textPreformat-foreground);
                        }
                        
                        pre {
                            background-color: var(--vscode-textCodeBlock-background);
                            padding: 8px 12px;
                            border-radius: 4px;
                            overflow-x: auto;
                            margin: 0;
                        }
                        
                        .status-icon {
                            width: 16px;
                            height: 16px;
                            border-radius: 50%;
                        }
                        
                        .passed .status-icon {
                            background-color: #2ea043;
                        }
                        
                        .failed .status-icon {
                            background-color: #f85149;
                        }
                    </style>
                </head>
                <body>
                    <div class="summary">
                        <svg class="progress-ring" viewBox="0 0 36 36">
                            <path d="M18 2.0845
                                a 15.9155 15.9155 0 0 1 0 31.831
                                a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="rgba(46, 160, 67, 0.4)"
                                stroke-width="3"
                                stroke-dasharray="${passRate}, 100"
                            />
                        </svg>
                        <div class="stats">
                            <h2>Test Results</h2>
                            <p>${passedTests} of ${totalTests} tests passed (${passRate.toFixed(1)}%)</p>
                        </div>
                    </div>
                    
                    ${results.map((result, index) => `
                        <div class="test-case ${result.passed ? 'passed' : 'failed'}">
                            <div class="test-header">
                                <div class="status-icon"></div>
                                Test Case ${index + 1}
                            </div>
                            <div class="test-content">
                                <div class="test-section">
                                    <div class="test-label">Input:</div>
                                    <pre>${result.input}</pre>
                                </div>
                                <div class="test-section">
                                    <div class="test-label">Expected Output:</div>
                                    <pre>${result.expectedOutput}</pre>
                                </div>
                                <div class="test-section">
                                    <div class="test-label">Actual Output:</div>
                                    <pre>${result.actualOutput || ''}</pre>
                                </div>
                                ${result.error ? `
                                    <div class="test-section">
                                        <div class="test-label">Error:</div>
                                        <pre>${result.error}</pre>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </body>
            </html>
        `;
    }

    dispose() {
        if (this._panel) {
            this._panel.dispose();
        }
    }
}

module.exports = { GuiProvider };