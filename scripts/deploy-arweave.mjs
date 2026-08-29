import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Arweave from 'arweave';
import { ArweaveSigner, createData } from 'arbundles';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, '..');
const DIST_DIR = path.join(PROJECT_DIR, 'dist');
const DEFAULT_WALLET_PATH = path.join(PROJECT_DIR, 'wallet.json');
const DEFAULT_UPLOAD_URL = 'https://up.arweave.net';
const FREE_SIZE_WARNING_BYTES = 100 * 1024;
const MAX_RETRIES = 3;

const CONTENT_TYPES = Object.freeze({
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
});

function printHelp() {
  console.log(`Deploy The Eye's production build to Arweave.

Usage:
  npm run deploy:arweave -- [options]

Options:
  --wallet <path>       Arweave JWK file (default: ./wallet.json)
  --service-url <url>   Upload service (default: ${DEFAULT_UPLOAD_URL})
  --dry-run             Inspect the built files without uploading
  --help                Show this help

Environment alternatives:
  ARWEAVE_WALLET_PATH
  ARWEAVE_UPLOAD_URL

The npm command builds the site first. If the default wallet.json is missing,
the script generates one and prints its address. An explicitly requested wallet
must already exist.`);
}

function parseArguments(argv) {
  const options = {
    dryRun: false,
    help: false,
    walletPath: process.env.ARWEAVE_WALLET_PATH || '',
    serviceUrl: process.env.ARWEAVE_UPLOAD_URL || DEFAULT_UPLOAD_URL
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--wallet' || argument === '--service-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value.`);
      }
      if (argument === '--wallet') options.walletPath = value;
      else options.serviceUrl = value;
      index += 1;
    } else if (argument.startsWith('--wallet=')) {
      options.walletPath = argument.slice('--wallet='.length);
    } else if (argument.startsWith('--service-url=')) {
      options.serviceUrl = argument.slice('--service-url='.length);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetriableError(message) {
  return /timeout|408|425|429|500|502|503|504|EAI_AGAIN|ECONNRESET|ECONNREFUSED|failed to fetch/i.test(message);
}

function normalizeServiceUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Upload service URL must use HTTP or HTTPS.');
  }
  return url.toString().replace(/\/+$/, '');
}

function resolveWalletPath(value) {
  if (!value) return DEFAULT_WALLET_PATH;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(PROJECT_DIR, value);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function getContentType(filename) {
  return CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

async function readPackageMetadata() {
  const packageJson = JSON.parse(await fs.readFile(path.join(PROJECT_DIR, 'package.json'), 'utf8'));
  return {
    appName: 'The-Eye',
    appVersion: packageJson.version || '1.0.0'
  };
}

async function collectFiles(directory, root = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, root));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        manifestPath: path.relative(root, absolutePath).split(path.sep).join('/')
      });
    }
  }

  return files.sort((left, right) => left.manifestPath.localeCompare(right.manifestPath));
}

async function loadWallet(walletPath, explicitWallet) {
  try {
    const wallet = JSON.parse(await fs.readFile(walletPath, 'utf8'));
    console.log(`Using wallet: ${walletPath}`);
    return wallet;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (explicitWallet) {
      throw new Error(`Wallet not found: ${walletPath}`);
    }
  }

  console.log(`No wallet found at ${walletPath}. Generating a new one...`);
  const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
  const wallet = await arweave.wallets.generate();
  await fs.writeFile(walletPath, `${JSON.stringify(wallet, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  const address = await arweave.wallets.jwkToAddress(wallet);
  console.log(`Generated wallet: ${walletPath}`);
  console.log(`Wallet address:   ${address}`);
  console.log('Back up this wallet securely. Larger uploads may require a funded upload account.\n');
  return wallet;
}

function readUploadId(bodyText) {
  if (!bodyText.trim()) return '';
  try {
    const parsed = JSON.parse(bodyText);
    if (typeof parsed === 'string') return parsed.trim();
    if (typeof parsed?.id === 'string') return parsed.id.trim();
  } catch {
    return bodyText.trim();
  }
  return '';
}

async function uploadWithRetry(serviceUrl, signer, data, tags, maxRetries = MAX_RETRIES) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const dataItem = createData(payload, signer, {
    tags: tags.map(([name, value]) => ({ name, value }))
  });

  await dataItem.sign(signer);
  const signedId = await dataItem.id;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const startedAt = Date.now();
      console.log(`  Attempt ${attempt}/${maxRetries}...`);
      const response = await fetch(`${serviceUrl}/tx`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: dataItem.getRaw()
      });
      const bodyText = await response.text();

      if (!response.ok) {
        throw new Error(`Upload failed (${response.status}${bodyText ? `): ${bodyText.slice(0, 220)}` : ')'}`);
      }

      const returnedId = readUploadId(bodyText);
      if (returnedId && returnedId !== signedId) {
        console.warn(`  Warning: service returned ${returnedId}; signed data-item ID is ${signedId}.`);
      }
      console.log(`  Uploaded in ${Date.now() - startedAt}ms: ${signedId}`);
      return signedId;
    } catch (error) {
      const message = error?.message || String(error);
      if (!isRetriableError(message) || attempt === maxRetries) throw error;
      const backoffMs = 1500 * attempt;
      console.warn(`  Transient failure: ${message}`);
      console.log(`  Retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
    }
  }

  throw new Error('Upload failed unexpectedly after all retries.');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const serviceUrl = normalizeServiceUrl(options.serviceUrl);
  const walletPath = resolveWalletPath(options.walletPath);
  const explicitWallet = Boolean(options.walletPath);
  const metadata = await readPackageMetadata();

  await fs.access(path.join(DIST_DIR, 'index.html'));
  const files = await collectFiles(DIST_DIR);
  if (!files.length) throw new Error(`No deployable files found in ${DIST_DIR}.`);

  const fileDetails = await Promise.all(files.map(async (file) => ({
    ...file,
    size: (await fs.stat(file.absolutePath)).size
  })));
  const totalSize = fileDetails.reduce((total, file) => total + file.size, 0);

  console.log('\nThe Eye - Arweave deployment');
  console.log('='.repeat(60));
  console.log(`Build directory: ${DIST_DIR}`);
  console.log(`Upload service: ${serviceUrl}`);
  console.log(`Files: ${fileDetails.length} (${formatBytes(totalSize)})\n`);

  for (const file of fileDetails) {
    const warning = file.size > FREE_SIZE_WARNING_BYTES ? '  [may incur upload cost]' : '';
    console.log(`  ${file.manifestPath} (${formatBytes(file.size)})${warning}`);
  }

  if (options.dryRun) {
    console.log('\nDry run complete. No wallet was loaded and nothing was uploaded.');
    return;
  }

  const wallet = await loadWallet(walletPath, explicitWallet);
  const signer = new ArweaveSigner(wallet);
  const manifestPaths = {};

  console.log('\nUploading build assets...');
  for (const file of fileDetails) {
    const fileData = await fs.readFile(file.absolutePath);
    console.log(`\nUploading ${file.manifestPath} (${formatBytes(file.size)})`);
    if (file.size > FREE_SIZE_WARNING_BYTES) {
      console.warn('  Warning: this file exceeds 100 KB and may not qualify for a free upload.');
    }

    const id = await uploadWithRetry(serviceUrl, signer, fileData, [
      ['Content-Type', getContentType(file.manifestPath)],
      ['App-Name', metadata.appName],
      ['App-Version', metadata.appVersion],
      ['Type', 'app-asset'],
      ['File-Path', file.manifestPath]
    ]);
    manifestPaths[file.manifestPath] = { id };
  }

  const manifest = {
    manifest: 'arweave/paths',
    version: '0.2.0',
    index: { path: 'index.html' },
    paths: manifestPaths
  };

  console.log('\nUploading path manifest...');
  const manifestId = await uploadWithRetry(
    serviceUrl,
    signer,
    JSON.stringify(manifest, null, 2),
    [
      ['Content-Type', 'application/x.arweave-manifest+json'],
      ['App-Name', metadata.appName],
      ['App-Version', metadata.appVersion],
      ['Type', 'manifest']
    ]
  );

  console.log('\n' + '='.repeat(60));
  console.log('Deployment successful');
  console.log(`Manifest ID: ${manifestId}`);
  console.log(`App URL:     https://arweave.net/${manifestId}/`);
  console.log(`Index URL:   https://arweave.net/${manifestId}/index.html`);
  console.log('='.repeat(60) + '\n');
}

main().catch((error) => {
  if (error?.code === 'ENOENT' && error?.path?.endsWith(path.join('dist', 'index.html'))) {
    console.error('\nDeployment failed: production build is missing. Run npm run build first.');
  } else {
    console.error(`\nDeployment failed: ${error?.message || error}`);
  }
  process.exitCode = 1;
});
