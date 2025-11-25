#!/usr/bin/env node

/**
 * Build Lambda Layers Script
 * Creates optimized Lambda layers for dependencies and common code
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const DEPENDENCIES_LAYER_DIR = path.join(BUILD_DIR, 'dependencies-layer');
const COMMON_LAYER_DIR = path.join(BUILD_DIR, 'common-layer');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, cwd = ROOT_DIR) {
  log(`Executing: ${command}`, 'blue');
  try {
    execSync(command, { cwd, stdio: 'inherit' });
  } catch (error) {
    log(`Error executing command: ${command}`, 'red');
    throw error;
  }
}

function cleanDirectory(dir) {
  if (fs.existsSync(dir)) {
    log(`Cleaning directory: ${dir}`, 'yellow');
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyDirectory(src, dest) {
  log(`Copying ${src} to ${dest}`, 'blue');
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function buildDependenciesLayer() {
  log('\n=== Building Dependencies Layer ===', 'green');

  const layerDir = path.join(DEPENDENCIES_LAYER_DIR, 'nodejs');
  cleanDirectory(layerDir);

  // Copy package.json and package-lock.json
  log('Copying package files...', 'blue');
  fs.copyFileSync(
    path.join(ROOT_DIR, 'package.json'),
    path.join(layerDir, 'package.json')
  );

  if (fs.existsSync(path.join(ROOT_DIR, 'package-lock.json'))) {
    fs.copyFileSync(
      path.join(ROOT_DIR, 'package-lock.json'),
      path.join(layerDir, 'package-lock.json')
    );
  }

  // Install production dependencies
  log('Installing production dependencies...', 'blue');
  execCommand('npm ci --omit=dev --ignore-scripts', layerDir);

  // Generate Prisma Client
  log('Generating Prisma Client...', 'blue');
  const schemaPath = path.join(ROOT_DIR, '..', 'prisma', 'schema.prisma');
  if (fs.existsSync(schemaPath)) {
    // Copy schema to layer directory
    fs.mkdirSync(path.join(layerDir, 'prisma'), { recursive: true });
    fs.copyFileSync(schemaPath, path.join(layerDir, 'prisma', 'schema.prisma'));

    // Generate Prisma Client in layer directory
    execCommand(`npx prisma generate --schema=${path.join(layerDir, 'prisma', 'schema.prisma')}`, layerDir);
  } else {
    log('Warning: Prisma schema not found, skipping client generation', 'yellow');
  }

  // Remove unnecessary files to reduce layer size
  log('Cleaning up unnecessary files...', 'blue');
  const unnecessaryPaths = [
    'node_modules/@prisma/engines',
    'node_modules/.bin',
    'node_modules/.cache',
    'prisma', // Remove schema after generation
  ];

  unnecessaryPaths.forEach((p) => {
    const fullPath = path.join(layerDir, p);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  });

  // Remove package files (not needed in layer)
  fs.unlinkSync(path.join(layerDir, 'package.json'));
  if (fs.existsSync(path.join(layerDir, 'package-lock.json'))) {
    fs.unlinkSync(path.join(layerDir, 'package-lock.json'));
  }

  log('Dependencies layer built successfully!', 'green');
}

function buildCommonLayer() {
  log('\n=== Building Common Layer ===', 'green');

  const layerDir = path.join(COMMON_LAYER_DIR, 'nodejs');
  cleanDirectory(layerDir);

  // Compile TypeScript common code
  log('Compiling common TypeScript code...', 'blue');
  execCommand('npx tsc -p common/tsconfig.json', ROOT_DIR);

  // Copy compiled common code to layer
  const commonDistDir = path.join(ROOT_DIR, 'common', 'dist');
  if (fs.existsSync(commonDistDir)) {
    const commonLayerDir = path.join(layerDir, 'common');
    copyDirectory(commonDistDir, commonLayerDir);
    log('Common code copied to layer', 'blue');
  } else {
    log('Error: Common dist directory not found', 'red');
    throw new Error('Common compilation failed');
  }

  log('Common layer built successfully!', 'green');
}

function buildLambdaFunctions() {
  log('\n=== Building Lambda Functions ===', 'green');

  const lambdas = [
    'payment-webhook-handler',
    'outbox-processor',
    'outbox-cleanup',
  ];

  for (const lambda of lambdas) {
    log(`\nBuilding ${lambda}...`, 'blue');

    const lambdaDir = path.join(ROOT_DIR, lambda);
    const distDir = path.join(lambdaDir, 'dist');

    // Clean dist directory
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }

    // Compile TypeScript
    execCommand(`npx tsc -p ${lambda}/tsconfig.json`, ROOT_DIR);

    log(`${lambda} built successfully!`, 'green');
  }

  log('\nAll Lambda functions built successfully!', 'green');
}

function createZipArchives() {
  log('\n=== Creating ZIP Archives ===', 'green');

  // Check if zip command is available
  try {
    execSync('which zip', { stdio: 'ignore' });
  } catch {
    log('Warning: zip command not found, skipping archive creation', 'yellow');
    log('You can manually zip the layers and functions from the build directory', 'yellow');
    return;
  }

  // Create dependencies layer zip
  log('Creating dependencies-layer.zip...', 'blue');
  execCommand(
    `zip -r ${path.join(BUILD_DIR, 'dependencies-layer.zip')} .`,
    DEPENDENCIES_LAYER_DIR
  );

  // Create common layer zip
  log('Creating common-layer.zip...', 'blue');
  execCommand(
    `zip -r ${path.join(BUILD_DIR, 'common-layer.zip')} .`,
    COMMON_LAYER_DIR
  );

  // Create Lambda function zips
  const lambdas = [
    'payment-webhook-handler',
    'outbox-processor',
    'outbox-cleanup',
  ];

  for (const lambda of lambdas) {
    log(`Creating ${lambda}.zip...`, 'blue');
    const lambdaDistDir = path.join(ROOT_DIR, lambda, 'dist');

    if (fs.existsSync(lambdaDistDir)) {
      execCommand(
        `zip -r ${path.join(BUILD_DIR, `${lambda}.zip`)} .`,
        lambdaDistDir
      );
    } else {
      log(`Warning: ${lambda} dist directory not found`, 'yellow');
    }
  }

  log('ZIP archives created successfully!', 'green');
}

function printLayerSizes() {
  log('\n=== Layer Sizes ===', 'green');

  const files = [
    'dependencies-layer.zip',
    'common-layer.zip',
    'payment-webhook-handler.zip',
    'outbox-processor.zip',
    'outbox-cleanup.zip',
  ];

  for (const file of files) {
    const filePath = path.join(BUILD_DIR, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      log(`${file}: ${sizeMB} MB`, 'blue');
    }
  }
}

// Main execution
async function main() {
  try {
    log('\n🚀 Starting Lambda Layers Build Process', 'green');
    log(`Root Directory: ${ROOT_DIR}`, 'blue');
    log(`Build Directory: ${BUILD_DIR}`, 'blue');

    // Create build directory
    if (!fs.existsSync(BUILD_DIR)) {
      fs.mkdirSync(BUILD_DIR, { recursive: true });
    }

    // Build steps
    buildDependenciesLayer();
    buildCommonLayer();
    buildLambdaFunctions();
    createZipArchives();
    printLayerSizes();

    log('\n✅ Build completed successfully!', 'green');
    log('\nOutput files are in:', 'blue');
    log(`  ${BUILD_DIR}`, 'blue');
    log('\nYou can now deploy these layers and functions to AWS Lambda', 'yellow');
  } catch (error) {
    log('\n❌ Build failed!', 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
