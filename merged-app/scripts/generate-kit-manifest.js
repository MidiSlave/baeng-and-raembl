#!/usr/bin/env node
/**
 * Generate combined factory kits manifest
 * Reads all individual kit manifests and creates a combined manifest
 * for the kit browser UI
 */

const fs = require('fs');
const path = require('path');

const factoryDir = path.join(__dirname, '..', 'samples', 'banks', 'factory');
const outputPath = path.join(__dirname, '..', 'samples', 'banks', 'factory-kits-manifest.json');

console.log('[Generate Kit Manifest] Starting...');
console.log(`[Generate Kit Manifest] Reading from: ${factoryDir}`);

// Read all manifest files
const manifestFiles = fs.readdirSync(factoryDir)
    .filter(f => f.endsWith('-manifest.json'))
    .sort();

console.log(`[Generate Kit Manifest] Found ${manifestFiles.length} kit manifests`);

const kits = manifestFiles.map(file => {
    const manifestPath = path.join(factoryDir, file);
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const kitId = file.replace('-manifest.json', '');
    const sampleCount = Object.keys(data.samples || {}).length;

    console.log(`[Generate Kit Manifest]   - ${data.name} (${sampleCount} samples)`);

    return {
        id: kitId,
        name: data.name,
        description: data.description || '',
        type: data.type || 'factory',
        sampleCount: sampleCount,
        manifestPath: `samples/banks/factory/${file}`
    };
});

const combinedManifest = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    kits: kits
};

// Write combined manifest
fs.writeFileSync(
    outputPath,
    JSON.stringify(combinedManifest, null, 2),
    'utf8'
);

console.log(`[Generate Kit Manifest] ✓ Generated ${outputPath}`);
console.log(`[Generate Kit Manifest] ✓ Total kits: ${kits.length}`);
console.log(`[Generate Kit Manifest] ✓ File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
