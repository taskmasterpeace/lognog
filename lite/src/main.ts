/**
 * LogNog Lite - Main Entry Point
 *
 * This is the entry point for the standalone LogNog Lite server.
 * It bundles into a single EXE that:
 * - Starts the API server
 * - Serves the UI
 * - Shows a system tray icon
 * - Uses SQLite for storage (no ClickHouse needed)
 *
 * By Machine King Labs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import open from 'open';

// Set environment for SQLite mode BEFORE importing anything else
process.env.LOGNOG_BACKEND = 'sqlite';
process.env.NODE_ENV = 'production';

// Get the directory where the EXE is running
const getDataDir = (): string => {
  // When running as pkg executable
  if ((process as any).pkg) {
    return path.join(path.dirname(process.execPath), 'data');
  }
  // When running in development
  return path.join(process.cwd(), 'data');
};

const dataDir = getDataDir();

// Ensure data directory exists
import fs from 'fs';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Set database paths
process.env.SQLITE_PATH = path.join(dataDir, 'lognog.db');
process.env.LOGS_DB_PATH = path.join(dataDir, 'lognog-logs.db');

// Now import the API
async function startServer() {
  const PORT = process.env.PORT || 4000;

  console.log('');
  console.log('========================================');
  console.log('   LogNog Lite - Starting Server');
  console.log('   By Machine King Labs');
  console.log('========================================');
  console.log('');
  console.log(`Data directory: ${dataDir}`);
  console.log(`Backend: SQLite`);
  console.log('');

  try {
    // Dynamic import of the API
    const apiModule = await import('../../api/dist/index.js');

    console.log(`Server running at http://localhost:${PORT}`);
    console.log('');
    console.log('Press Ctrl+C to stop');

    // Open browser automatically on first run
    const firstRunFile = path.join(dataDir, '.first_run');
    if (!fs.existsSync(firstRunFile)) {
      fs.writeFileSync(firstRunFile, new Date().toISOString());
      setTimeout(() => {
        open(`http://localhost:${PORT}`);
      }, 2000);
    }

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
