#!/usr/bin/env node

/**
 * Native Messaging Host Installer
 * Installs the native messaging manifest for Chrome on macOS, Linux, and Windows
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const MANIFEST_NAME = 'com.llmtracker.native_host.json';
const HOST_NAME = 'com.llmtracker.native_host';

/**
 * Get the platform-specific manifest directory for Chrome
 */
function getManifestDir() {
  const platform = os.platform();
  const homeDir = os.homedir();

  switch (platform) {
    case 'darwin': // macOS
      return path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome',
        'NativeMessagingHosts'
      );

    case 'linux':
      return path.join(homeDir, '.config', 'google-chrome', 'NativeMessagingHosts');

    case 'win32':
      // Windows requires registry, not file-based
      return null;

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Install the native messaging host
 */
function install(extensionId) {
  console.log('Installing LLM Tracker Native Messaging Host...');

  if (!extensionId) {
    console.error('Error: Extension ID is required');
    console.log('Usage: node install.js <extension-id>');
    console.log('Example: node install.js abcdefghijklmnopqrstuvwxyz123456');
    process.exit(1);
  }

  const platform = os.platform();

  if (platform === 'win32') {
    console.log('Windows installation requires registry modification.');
    console.log('Please run: install.bat as Administrator');
    return;
  }

  // Get manifest directory
  const manifestDir = getManifestDir();
  if (!manifestDir) {
    throw new Error('Could not determine manifest directory');
  }

  // Create directory if it doesn't exist
  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
    console.log(`Created directory: ${manifestDir}`);
  }

  // Read manifest template
  const templatePath = path.join(__dirname, 'manifest.json.template');
  let manifest = fs.readFileSync(templatePath, 'utf8');

  // Replace placeholders
  const hostPath = path.join(__dirname, 'host.js');
  manifest = manifest.replace('INSTALL_PATH', __dirname);
  manifest = manifest.replace('EXTENSION_ID', extensionId);

  // Make host.js executable
  try {
    fs.chmodSync(hostPath, '755');
    console.log(`Made ${hostPath} executable`);
  } catch (err) {
    console.warn(`Warning: Could not make host.js executable: ${err.message}`);
  }

  // Write manifest
  const manifestPath = path.join(manifestDir, MANIFEST_NAME);
  fs.writeFileSync(manifestPath, manifest);
  console.log(`Installed manifest to: ${manifestPath}`);

  // Verify installation
  if (fs.existsSync(manifestPath)) {
    console.log('✓ Installation successful!');
    console.log('\nNext steps:');
    console.log('1. Install dependencies: npm install');
    console.log('2. Start the desktop app (it will listen on ws://localhost:9876)');
    console.log('3. Load the Chrome extension with the provided extension ID');
    console.log('4. The native host will start automatically when the extension connects');
  } else {
    console.error('✗ Installation failed');
    process.exit(1);
  }
}

/**
 * Uninstall the native messaging host
 */
function uninstall() {
  console.log('Uninstalling LLM Tracker Native Messaging Host...');

  const manifestDir = getManifestDir();
  if (!manifestDir) {
    throw new Error('Could not determine manifest directory');
  }

  const manifestPath = path.join(manifestDir, MANIFEST_NAME);

  if (fs.existsSync(manifestPath)) {
    fs.unlinkSync(manifestPath);
    console.log(`Removed: ${manifestPath}`);
    console.log('✓ Uninstallation successful!');
  } else {
    console.log('Native messaging host is not installed');
  }
}

// Main
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'uninstall') {
    uninstall();
  } else if (command === 'install' || !command) {
    const extensionId = args[1] || args[0];
    install(extensionId);
  } else {
    console.log('Usage:');
    console.log('  Install:   node install.js [install] <extension-id>');
    console.log('  Uninstall: node install.js uninstall');
  }
}

module.exports = { install, uninstall, getManifestDir };
