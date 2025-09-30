import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * Get the current directory path in ES module context
 * @returns The current directory path
 */
function getCurrentDir() {
  try {
    // Try to use import.meta.url if available (ES modules)
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch (error) {
    // Fallback for CommonJS or when import.meta is not available
  }

  // Fallback to __dirname equivalent or current working directory
  return path.dirname(process.argv[1]) || process.cwd();
}

/**
 * Find the project root by looking for the package.json file.
 * @param startDir - The directory to start searching from.
 * @returns The project root directory.
 */
function findProjectRoot(startDir: string): string {
  let currentDir = startDir;

  while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // Fall back to the current working directory if project root isn't found
  return process.cwd();
}

// Get project root
export const projectRoot = findProjectRoot(getCurrentDir());

// Define output directory relative to the project root
const outputDir = path.join(projectRoot, 'output');
