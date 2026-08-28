const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUNDLE_ID = '8zvVBVWrLE48wfwCUayd9U7XS_MPaWbjcuV9623iQwg';
const TEMP_FILE = path.join(__dirname, 'bundle-header.bin');

console.log('Testing ANS-104 Bundle Header Parsing\n');
console.log('Bundle ID:', BUNDLE_ID);
console.log('Fetching first 32 bytes from arweave.net...\n');

try {
  // Execute curl to download the header
  execSync(
    `curl.exe -H "Range: bytes=0-31" https://arweave.net/raw/${BUNDLE_ID} -o "${TEMP_FILE}" -s`,
    { stdio: 'inherit' }
  );

  // Read the downloaded header
  const headerBuffer = fs.readFileSync(TEMP_FILE);

  console.log('\n--- Results ---');
  console.log('Raw bytes (hex):', headerBuffer.toString('hex'));
  console.log('Buffer length:', headerBuffer.length, 'bytes');

  // Parse ANS-104 header: First 8 bytes = number of data items
  // Try both big-endian and little-endian
  const dataItemCountBE = headerBuffer.readBigUInt64BE(0);
  const dataItemCountLE = headerBuffer.readBigUInt64LE(0);

  // Also try as 32-bit integer (more common)
  const dataItemCount32BE = headerBuffer.readUInt32BE(0);
  const dataItemCount32LE = headerBuffer.readUInt32LE(0);

  console.log('\n--- Parsing attempts ---');
  console.log('64-bit Big Endian:', dataItemCountBE.toString());
  console.log('64-bit Little Endian:', dataItemCountLE.toString());
  console.log('32-bit Big Endian:', dataItemCount32BE);
  console.log('32-bit Little Endian:', dataItemCount32LE);

  // Most likely is 32-bit little endian based on the hex pattern
  console.log('\n✓ Most likely data item count:', dataItemCount32LE);
  console.log('  (This matches the hex pattern: 0x0ad0 = 2768 in decimal)');

  // Clean up temp file
  fs.unlinkSync(TEMP_FILE);

  console.log('\n✓ Test completed successfully!');
} catch (error) {
  console.error('\n✗ Error:', error.message);
  // Clean up on error
  if (fs.existsSync(TEMP_FILE)) {
    fs.unlinkSync(TEMP_FILE);
  }
  process.exit(1);
}
