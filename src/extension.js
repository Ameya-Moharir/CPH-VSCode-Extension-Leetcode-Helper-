const vscode = require('vscode');
const path = require('path');
const { LeetCodeScraper } = require('./backend/scraper');
const { CodeExecutor } = require('./backend/executor');
const { GuiProvider } = require('./gui/gui');
const { FileHandler } = require('./backend/utils/fileHandler');
const { TestCaseManager } = require('./testCaseManager');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let bridgeServer = null;

async function startBridgeServer() {
    return new Promise((resolve, reject) => {
        const serverPath = path.join(__dirname, '..', 'bridge-server.js');
        bridgeServer = spawn('node', [serverPath], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        bridgeServer.stdout.on('data', (data) => {
            console.log(`Bridge server: ${data}`);
            if (data.toString().includes('Bridge server running on port')) {
                resolve();
            }
        });

        bridgeServer.stderr.on('data', (data) => {
            console.error(`Bridge server error: ${data}`);
        });

        bridgeServer.on('error', (error) => {
            console.error('Failed to start bridge server:', error);
            reject(error);
        });
    });
}

async function activate(context) {
    console.log('LeetCode Helper Extension activating...');
    try {
        await startBridgeServer();
        console.log('Bridge server started successfully');
    } catch (error) {
        console.error('Failed to start bridge server:', error);
        vscode.window.showErrorMessage('Failed to start bridge server. Please try reloading the window.');
    }

    try{
        const app = express();
        console.log('Express app created');
    app.use(cors());
    app.use(express.json());
    
    app.post('/fetch-test-cases', async (req, res) => {
        try {
            const { url } = req.body;
            console.log('Received fetch request for URL:', url);
            
            if (!url || !url.startsWith('https://leetcode.com/problems/')) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid LeetCode URL'
                });
            }

            await vscode.commands.executeCommand('leetcode-helper.fetchTestCases', url);
            res.json({ success: true });
        } catch (error) {
            console.error('Fetch error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    const server = app.listen(0, () => {
        try {
            const port = server.address().port;
            console.log('VS Code extension server started on port:', port);
            
            const portFile = path.join(os.tmpdir(), 'leetcode-helper-port.txt');
            console.log('Creating port file at:', portFile);
            
            fs.writeFileSync(portFile, port.toString(), 'utf8');
            console.log('Port file created successfully');
            
            // Verify the file
            if (fs.existsSync(portFile)) {
                const savedPort = fs.readFileSync(portFile, 'utf8');
                console.log('Verified port file contains:', savedPort);
            }
            
            context.globalState.update('serverPort', port);
        } catch (error) {
            console.error('Error in server setup:', error.message);
            console.error(error.stack);
        }
    });
    console.log('Server listen command executed');}
    catch (error) {
        console.error('Error during extension activation:', error);
    }
    // Clean up server when extension deactivates
       // Add cleanup on deactivation
     context.subscriptions.push({
        dispose: () => {
            try {
                if (bridgeServer) {
                    bridgeServer.kill();
                    console.log('Bridge server stopped');
                }
                const portFile = path.join(os.tmpdir(), 'leetcode-helper-port.txt');
                if (fs.existsSync(portFile)) {
                    fs.unlinkSync(portFile);
                    console.log('Port file cleaned up');
                }
            } catch (error) {
                console.error('Error during cleanup:', error);
            }
        }
    });


    console.log('Extension activation completed');
    // Initialize with workspace path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first');
        return;
    }

    const scraper = new LeetCodeScraper();
    const executor = new CodeExecutor();
    const gui = new GuiProvider(context.extensionUri);
    const fileHandler = new FileHandler();
    const testCaseManager = new TestCaseManager(context.extensionUri);

    let fetchTestCases = vscode.commands.registerCommand('leetcode-helper.fetchTestCases', async (url) => {
        try {
            if (!workspaceFolder) {
                throw new Error('No workspace folder found. Please open a folder first.');
            }

            // Get LeetCode URL
            
            
            if (!url)  {
                url = await vscode.window.showInputBox({
                    prompt: 'Enter LeetCode problem URL',
                    placeHolder: 'https://leetcode.com/problems/problem-name',
                    ignoreFocusOut: true
                });
            }
            if (!url) return;
            // Language selection
            const language = await vscode.window.showQuickPick(
                ['C++', 'Python','Java'],
                {
                    placeHolder: 'Select programming language',
                    ignoreFocusOut: true
                }
            );

            if (!language) return;

            // Show progress indicator
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Fetching problem data...",
                cancellable: false
            }, async (progress) => {
                // Fetch problem data
                const data = await scraper.fetchTestCases(url);
                
                if (!data || !data.metadata || !data.metadata.title) {
                    throw new Error('Failed to fetch problem data');
                }

                // Create file name based on problem title
                const sanitizedTitle = fileHandler.sanitizeProblemTitle(data.metadata.title);
                const fileExt = language === 'C++' ? '.cpp' : 
                                language === 'Java' ? '.java' : '.py';
                const fileName = `${sanitizedTitle}${fileExt}`;
                const filePath = path.join(workspaceFolder.uri.fsPath, fileName);

                progress.report({ message: 'Creating solution file...' });

                // Get template for selected language
                const template = data.templates.find(t => {
                    if (language === 'C++') return t.langSlug === 'cpp';
                    if (language === 'Java') return t.langSlug === 'java';
                    return t.langSlug === 'python' || t.langSlug === 'python3';
                });

                if (!template) {
                    throw new Error(`No template found for ${language}`);
                }

                // Save test cases first
                await fileHandler.saveTestCases({
                    ...data,
                    metadata: {
                        ...data.metadata,
                        language: language.toLowerCase()
                    }
                });

                // Create and open the solution file
                const uri = vscode.Uri.file(filePath);
                const wsEdit = new vscode.WorkspaceEdit();
                wsEdit.createFile(uri, { overwrite: true });
                await vscode.workspace.applyEdit(wsEdit);

                // Insert template code
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                const editor = await vscode.window.showTextDocument(doc);
                await editor.edit(editBuilder => {
                    editBuilder.insert(new vscode.Position(0, 0), template.code);
                });

                // Format the document
                try {
                    await vscode.commands.executeCommand('editor.action.formatDocument');
                } catch (formatError) {
                    console.log('Format error (non-critical):', formatError);
                }

                // Automatically show test case manager
                await testCaseManager.showTestCaseManager(data.metadata.title);
                
                // Split editor to show both code and test cases side by side
                await vscode.commands.executeCommand('workbench.action.moveEditorToFirstGroup');
                
                vscode.window.showInformationMessage(
                    `Created ${fileName} with test cases`
                );
            });

        } catch (error) {
            console.error('Fetch error:', error);
            vscode.window.showErrorMessage(`Failed to fetch test cases: ${error.message}`);
        }
    });
    context.subscriptions.push(fetchTestCases);

    let runTests = vscode.commands.registerCommand('leetcode-helper.runTests', async () => {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                throw new Error('No active editor');
            }
            const results = await executor.runTests(editor.document.fileName);
            gui.showResults(results);
        } catch (error) {
            console.error('Test error:', error);
            vscode.window.showErrorMessage(`Failed to run tests: ${error.message}`);
        }
    });

    // Register a file system watcher to monitor when files are saved
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{cpp,py}');
    watcher.onDidChange(async (uri) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.toString() === uri.toString()) {
            const problemTitle = path.basename(editor.document.fileName, path.extname(editor.document.fileName));
            if (testCaseManager.isTestCaseManagerOpen()) {
                await testCaseManager.refreshTestCaseManager(problemTitle);
            }
        }
    });

    context.subscriptions.push(fetchTestCases, runTests, watcher);
}

module.exports = { activate };