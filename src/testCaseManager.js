const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const { FileHandler } = require('./backend/utils/fileHandler');

class TestCaseManager {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this._panel = null;
        this._fileHandler = new FileHandler();
        this._currentProblemTitle = null; 
    }

    isTestCaseManagerOpen() {
        return this._panel !== null && !this._panel.disposed;
    }

    async refreshTestCaseManager(problemTitle) {
        if (this.isTestCaseManagerOpen()) {
            const testData = await this._fileHandler.loadTestData(problemTitle);
            this._panel.webview.postMessage({
                command: 'refreshData',
                data: testData,
                problemTitle: problemTitle // Send problem title with refresh
            });
        }
    }
    async _handleAddTestCase(problemTitle, testCase) {
        const testData = await this._fileHandler.loadTestData(problemTitle);
        testData.testCases.push(testCase);
        testData.metadata.expectedOutputs.push('');
        await this._fileHandler.saveTestCases(testData);
    }
    async _handleDeleteTestCase(problemTitle, index) {
        try {
            const testData = await this._fileHandler.loadTestData(problemTitle);
            
            // Remove from testCases array
            testData.testCases.splice(index, 1);
            testData.metadata.expectedOutputs.splice(index, 1);
            if (testData.metadata.results) {
                testData.metadata.results.splice(index, 1);
            }
            
            // Save updated test data
            await this._fileHandler.saveTestCases(testData);
            
            // Delete the input file
            const problemDir = this._fileHandler.getProblemPath(problemTitle);
            const inputFile = path.join(problemDir, 'test_cases', `input_${index + 1}.txt`);
            await fs.unlink(inputFile);

            // Refresh the UI
            await this.refreshTestCaseManager(problemTitle);
            
            // Show success message
            vscode.window.showInformationMessage('Test case deleted successfully');
        } catch (error) {
            console.error(`Error deleting test case: ${error}`);
            vscode.window.showErrorMessage(`Failed to delete test case: ${error.message}`);
        }
    }

    async _handleUpdateTestCase(problemTitle, index, testCase) {
        const testData = await this._fileHandler.loadTestData(problemTitle);
        testData.testCases[index] = testCase;
        await this._fileHandler.saveTestCases(testData);
    }

    
    async _handleSaveAll(problemTitle, testCases, metadata) {
        await this._fileHandler.saveTestCases({
            testCases,
            metadata,
            templates: (await this._fileHandler.loadTestData(problemTitle)).templates
        });
    }

    async _handleRunTest(problemTitle, index) {
        // Get current active editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor found');
        }

        // Get file content
        const fileContent = editor.document.getText();
        
        // Get test data
        const testData = await this._fileHandler.loadTestData(problemTitle);
        const testCase = testData.testCases[index];
        const expectedOutput = testData.metadata.expectedOutputs[index];

        // Generate and run test
        const executor = new (require('./backend/executor')).CodeExecutor();
        const result = await executor.runSingleTest(fileContent, testCase, expectedOutput, testData.metadata);

        // Update test results
        if (!testData.metadata.results) {
            testData.metadata.results = [];
        }
        testData.metadata.results[index] = result;
        await this._fileHandler.saveTestCases(testData);

        // Refresh UI
        await this.refreshTestCaseManager(problemTitle);
    }

    async showTestCaseManager(problemTitle) {
        this._currentProblemTitle = problemTitle;

        // Create or focus the test case manager panel
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.Beside);
            await this.refreshTestCaseManager(problemTitle);
        } else {
            this._panel = vscode.window.createWebviewPanel(
                'testCaseManager',
                'Test Case Manager',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            const testData = await this._fileHandler.loadTestData(problemTitle);
            this._panel.webview.html = this._getWebviewContent(testData, problemTitle);

            // Set up message handlers
            this._panel.webview.onDidReceiveMessage(async message => {
                try {
                    switch (message.command) {
                        case 'runTests':
                            const editor = vscode.window.activeTextEditor;
                            if (editor) {
                            await vscode.commands.executeCommand('leetcode-helper.runTests');
                            }
                            else{
                                vscode.window.showErrorMessage("No Text Editor Active");  
                            }
                            break;
                            
                        case 'addTestCase':
                            await this._handleAddTestCase(this._currentProblemTitle, message.testCase);
                            break;
                        case 'deleteTestCase':
                            await this._handleDeleteTestCase(this._currentProblemTitle, message.index);
                            break;
                        case 'saveAll':
                            await this._handleSaveAll(this._currentProblemTitle, message.testCases, message.metadata);
                            break;
                        case 'error':
                            vscode.window.showErrorMessage(message.message);
                            break;
                    }
                    await this.refreshTestCaseManager(this._currentProblemTitle);
                } catch (error) {
                    vscode.window.showErrorMessage(`Error: ${error.message}`);
                }
            });

            this._panel.onDidDispose(() => {
                this._panel = null;
            });
        }
        await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');

    }
    
    _getWebviewContent(testData, problemTitle) {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        /* Previous styles remain exactly the same */
        body {
            padding: 24px;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            font-family: var(--vscode-font-family);
            max-width: 900px;
            margin: 0 auto;
        }

        h2 {
            color: var(--vscode-textLink-foreground);
            font-size: 1.8em;
            margin-bottom: 24px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .test-case {
            margin-bottom: 24px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            transition: all 0.3s ease;
        }

        .test-case:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            transform: translateY(-2px);
        }

        .test-case.passed {
            border-left: 4px solid #4CAF50;
        }

        .test-case.failed {
            border-left: 4px solid #f44336;
        }

        .test-case-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            background-color: var(--vscode-editor-lineHighlightBackground);
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .test-case-header h3 {
            margin: 0;
            color: var(--vscode-textLink-foreground);
            font-size: 1.2em;
        }

        .test-case-content {
            padding: 20px;
        }

        .input-group {
            margin-bottom: 16px;
        }

        .input-group label {
            display: block;
            margin-bottom: 8px;
            color: var(--vscode-textLink-activeForeground);
            font-weight: 500;
        }

        textarea {
            width: 100%;
            min-height: 100px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 12px;
            font-family: 'Fira Code', monospace;
            font-size: 0.9em;
            line-height: 1.5;
            resize: vertical;
            transition: border-color 0.3s ease;
        }

        textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 2px var(--vscode-focusBorder);
        }

        .button-group {
            display: flex;
            gap: 12px;
            margin-top: 20px;
        }

        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }

        .delete-btn {
            background-color: var(--vscode-errorForeground);
            opacity: 0.8;
        }

        .delete-btn:hover {
            opacity: 1;
        }

        .status-badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status-passed {
            background-color: rgba(76, 175, 80, 0.2);
            color: #4CAF50;
            border: 1px solid #4CAF50;
        }

        .status-failed {
            background-color: rgba(244, 67, 54, 0.2);
            color: #f44336;
            border: 1px solid #f44336;
        }

        .main-actions {
            position: sticky;
            bottom: 24px;
            background-color: var(--vscode-editor-background);
            padding: 16px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            margin-top: 32px;
            display: flex;
            justify-content: center;
            gap: 16px;
            z-index: 100;
        }

        .main-actions button {
            min-width: 140px;
            justify-content: center;
        }
    </style>
</head>
<body>
    <h2>${problemTitle}</h2>
    <div id="test-cases"></div>
    <div class="main-actions">
        <button onclick="addNewTestCase()">+ Add Test Case</button>
        <button onclick="saveAllTestCases()">💾 Save All Changes</button>
        <button onclick="runAllTests()">▶️ Run Test Cases</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let testCases = ${JSON.stringify(testData.testCases)};
        let metadata = ${JSON.stringify(testData.metadata)};
        let currentProblemTitle = "${problemTitle}";

        function renderTestCases() {
            const container = document.getElementById('test-cases');
            container.innerHTML = testCases.map((tc, index) => {
                const status = metadata.results && metadata.results[index];
                const statusClass = status ? (status.passed ? 'passed' : 'failed') : '';
                return \`
                    <div class="test-case \${statusClass}">
                        <div class="test-case-header">
                            <h3>Test Case \${index + 1}</h3>
                            \${status ? \`
                                <span class="status-badge \${status.passed ? 'status-passed' : 'status-failed'}">
                                    \${status.passed ? '✓ Passed' : '✕ Failed'}
                                </span>
                            \` : ''}
                        </div>
                        <div class="test-case-content">
                            <div class="input-group">
                                <label>Input Parameters:</label>
                                <textarea
                                    onchange="updateTestCase(\${index}, this.value, 'input')"
                                >\${JSON.stringify(tc, null, 2)}</textarea>
                            </div>
                            <div class="input-group">
                                <label>Expected Output:</label>
                                <textarea
                                    onchange="updateExpectedOutput(\${index}, this.value)"
                                >\${metadata.expectedOutputs[index] || ''}</textarea>
                            </div>
                            \${status ? \`
                                <div class="input-group">
                                    <label>Actual Output:</label>
                                    <textarea readonly>\${status.output || ''}</textarea>
                                </div>
                            \` : ''}
                            <div class="button-group">
                                <button onclick="deleteTestCase(\${index})" class="delete-btn">🗑️ Delete</button>
                            </div>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        // Rest of the JavaScript remains exactly the same
        function runAllTests() {
            vscode.postMessage({
                command: 'runTests'
            });
        }                   

        function updateTestCase(index, value, type) {
            try {
                const parsed = JSON.parse(value);
                if (type === 'input') {
                    testCases[index] = parsed;
                } else {
                    metadata.expectedOutputs[index] = parsed;
                }
                saveAllTestCases();
            } catch (e) {
                vscode.postMessage({
                    command: 'error',
                    message: 'Invalid JSON format'
                });
            }
        }

        function updateExpectedOutput(index, value) {
            try {
                metadata.expectedOutputs[index] = value.trim();
                saveAllTestCases();
            } catch (e) {
                vscode.postMessage({
                    command: 'error',
                    message: 'Invalid output format'
                });
            }
        }

        function addNewTestCase() {
            testCases.push({});
            metadata.expectedOutputs.push('');
            renderTestCases();
            vscode.postMessage({
                command: 'addTestCase',
                testCase: {}
            });
        }

        function deleteTestCase(index) {
            vscode.postMessage({
                command: 'deleteTestCase',
                index: index
            });
        }

        function saveAllTestCases() {
            vscode.postMessage({
                command: 'saveAll',
                testCases: testCases,
                metadata: metadata
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'refreshData':
                    testCases = message.data.testCases;
                    metadata = message.data.metadata;
                    if (message.problemTitle) {
                        currentProblemTitle = message.problemTitle;
                        document.querySelector('h2').textContent = currentProblemTitle;
                    }
                    renderTestCases();
                    break;
            }
        });

        // Initial render
        renderTestCases();
    </script>
</body>
</html>`;
    }
}

module.exports = { TestCaseManager };