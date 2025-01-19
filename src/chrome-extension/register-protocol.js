// register-protocol.js
const { exec } = require('child_process');
const path = require('path');

const protocolName = 'leetcode-helper';
const extensionPath = path.join(__dirname, 'extension-path.bat');

// Create a batch file to handle the protocol
const batchContent = `@echo off
code --open-url "%1"`;

require('fs').writeFileSync(extensionPath, batchContent);

// Registry commands
const commands = [
    `REG ADD "HKEY_CLASSES_ROOT\\${protocolName}" /f /ve /t REG_SZ /d "URL:${protocolName} Protocol"`,
    `REG ADD "HKEY_CLASSES_ROOT\\${protocolName}" /f /v "URL Protocol" /t REG_SZ /d ""`,
    `REG ADD "HKEY_CLASSES_ROOT\\${protocolName}\\shell" /f`,
    `REG ADD "HKEY_CLASSES_ROOT\\${protocolName}\\shell\\open" /f`,
    `REG ADD "HKEY_CLASSES_ROOT\\${protocolName}\\shell\\open\\command" /f /ve /t REG_SZ /d "\\"${extensionPath}\\" \\"%1\\""`,
];

// Execute registry commands
commands.forEach(command => {
    exec(command, (error) => {
        if (error) {
            console.error(`Error executing command: ${command}`, error);
        }
    });
});

console.log('Protocol handler registered successfully!');