const fs = require('fs').promises;
const { execSync } = require('child_process');
const path = require('path');
const vscode = require('vscode');
const { FileHandler } = require('./utils/fileHandler');

class CodeExecutor {
    constructor() {
        this.fileHandler = new FileHandler();
        this.isWindows = process.platform === 'win32';
    }

    async saveTestCases(data) {
        await this.fileHandler.saveTestCases(data);
    }
    // Helper method to get sanitized problem title from file name
    getProblemTitleFromFileName(fileName) {
        // Remove file extension
        const baseFileName = fileName.split('.')[0];
        // Sanitize the name same way as FileHandler does
        return baseFileName.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }

    async runTests(filePath) {
        try {
            const extension = path.extname(filePath);
            const language = this.getLanguage(extension);
            const userCode = await fs.readFile(filePath, 'utf8');

            // Get sanitized problem title from file name
            const fileName = path.basename(filePath);
            const problemTitle = this.getProblemTitleFromFileName(fileName);

            const tempFilePath = await this.createTempFile(userCode, language);

            // Load test data with sanitized problem title
            const { testCases, metadata } = await this.fileHandler.loadTestData(problemTitle);

            if (!testCases || !metadata) {
                throw new Error(`No test data found for problem: ${problemTitle}`);
            }

            const results = [];
            let passedTests = 0;

            for (let i = 0; i < testCases.length; i++) {
                try {
                    const testCase = testCases[i];
                    const expectedOutput = metadata.expectedOutputs[i];
                    const output = await this.executeTest(tempFilePath, testCase, language, metadata);

                    const passed = this.compareOutputs(output.trim(), expectedOutput.trim(), metadata.return.type);
                    if (passed) passedTests++;

                    results.push({
                        testCase: i + 1,
                        input: testCase,
                        expectedOutput: expectedOutput,
                        actualOutput: output.trim(),
                        passed: passed,
                        error: null
                    });

                    await this.fileHandler.saveTestOutput(
                        problemTitle,
                        i + 1,
                        output.trim(),
                        passed
                    );

                } catch (error) {
                    results.push({
                        testCase: i + 1,
                        input: testCases[i],
                        expectedOutput: metadata.expectedOutputs[i],
                        actualOutput: null,
                        passed: false,
                        error: error.message
                    });

                    await this.fileHandler.saveTestOutput(
                        problemTitle,
                        i + 1,
                        error.message,
                        false
                    );
                }
            }

            await fs.unlink(tempFilePath);
            console.log(`Passed: ${passedTests}/${testCases.length} tests`);
            return results;
        } catch (error) {
            throw new Error(`Test execution failed: ${error.message}`);
        }
    }

    compareOutputs(actual, expected, returnType) {
        try {
            // Clean up the outputs
            actual = actual.replace(/\s+/g, '');
            expected = expected.replace(/\s+/g, '');

            // Handle array return types
            if (returnType.toLowerCase().includes('[]') || returnType.toLowerCase().includes('vector')) {
                const parseArray = (str) => {
                    str = str.replace(/\s+/g, '');
                    if (!str.startsWith('[') || !str.endsWith(']')) {
                        return null;
                    }
                    try {
                        return JSON.parse(str);
                    } catch {
                        // If JSON.parse fails, try to parse as array
                        const items = str.slice(1, -1).split(',');
                        return items.map(item => !isNaN(item) ? Number(item) : item);
                    }
                };

                const actualArr = parseArray(actual);
                const expectedArr = parseArray(expected);

                if (!actualArr || !expectedArr) return false;
                return JSON.stringify(actualArr) === JSON.stringify(expectedArr);
            }

            // For non-array types
            return actual === expected;
        } catch (error) {
            console.error('Comparison error:', error);
            return false;
        }
    }

    async createTempFile(userCode, language) {
        try {
            const tempDir = path.join(__dirname, 'temp');
            await fs.mkdir(tempDir, { recursive: true });

            // Get the active editor's file name
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                throw new Error('No active editor found');
            }

            // Get sanitized problem title from file name
            const fileName = path.basename(editor.document.fileName);
            const problemTitle = this.getProblemTitleFromFileName(fileName);

            // Load test data using the sanitized problem title
            const { metadata } = await this.fileHandler.loadTestData(problemTitle);

            if (!metadata) {
                throw new Error(`Failed to load metadata for problem: ${problemTitle}`);
            }

            // Generate the driver code
            const driverCode = await this.fileHandler.getLanguageDriver(language, metadata, userCode);
            const tempFilePath = path.join(tempDir, `solution.${language}`);

            await fs.writeFile(tempFilePath, driverCode, 'utf8');
            return tempFilePath;
        } catch (error) {
            throw new Error(`Failed to create temp file: ${error.message}`);
        }
    }
    async cleanup() {
        try {
            const tempDir = path.join(__dirname, 'temp');
            const files = await fs.readdir(tempDir);

            for (const file of files) {
                await fs.unlink(path.join(tempDir, file));
            }

            // Also cleanup the driver file if it exists
            const driverPath = path.join(this.fileHandler.testCasesDir, 'driver.cpp');
            if (await fs.access(driverPath).then(() => true).catch(() => false)) {
                await fs.unlink(driverPath);
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }

    async executeTest(filePath, testCase, language, metadata) {
        try {
            const dirPath = path.dirname(filePath);
            const baseFileName = path.basename(filePath, `.${language}`);
            const executableExt = this.isWindows ? '.exe' : '';
            const executablePath = path.join(dirPath, `${baseFileName}${executableExt}`);

            if (language === 'cpp') {
                const compileCmd = `g++ -std=c++17 "${filePath}" -o "${executablePath}"`;
                execSync(compileCmd, { stdio: 'pipe' });

                // Parse the test case if it's a string
                const parsedTest = typeof testCase === 'string' ? JSON.parse(testCase) : testCase;

                const runCmd = this.isWindows ? `"${executablePath}"` : executablePath;
                const output = execSync(runCmd, {
                    input: JSON.stringify(parsedTest) + '\n',
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: dirPath,
                    encoding: 'utf8'
                });

                return output;
            }
            else if (language === 'python') {
                // Parse the test case if it's a string
                const parsedTest = typeof testCase === 'string' ? JSON.parse(testCase) : testCase;

                // Run Python script with the test case as input
                const output = execSync(`python "${filePath}"`, {
                    input: JSON.stringify(parsedTest) + '\n',
                    stdio: ['pipe', 'pipe', 'pipe'],
                    encoding: 'utf8'
                });

                return output;
            }
            else if (language === 'java') {
                const parsedTest = typeof testCase === 'string' ? JSON.parse(testCase) : testCase;
                const classPath = dirPath;
                const compileCmd = `javac -cp "${classPath}" "${filePath}"`;
                execSync(compileCmd, { stdio: 'pipe' });

                // Run Java program
                const runCmd = `java -cp "${classPath}" Main`;
                return execSync(runCmd, {
                    input: JSON.stringify(parsedTest) + '\n',
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: dirPath,
                    encoding: 'utf8'
                });
            }
            throw new Error(`Language ${language} not supported yet`);
        } catch (error) {
            throw error;
        }
    }

    formatTestCaseInput(testCase, metadata) {
        const parts = [];
        for (const param of metadata.params) {
            const value = testCase[param.name];
            if (param.type.includes('[]')) {
                parts.push(`${param.name} = [${value}]`);
            } else {
                parts.push(`${param.name} = ${value}`);
            }
        }
        return parts.join(', ') + '\n';
    }
    
    getLanguage(extension) {
        switch (extension) {
            case '.cpp': return 'cpp';
            case '.py': return 'python';
            case '.python': return 'python';
            case '.java': return 'java';
            default: throw new Error('Unsupported file extension');
        }
    }

}
module.exports = { CodeExecutor };