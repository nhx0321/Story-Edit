import fs from 'fs';
import path from 'path';

// Root directories
// process.cwd() → apps/server/ in dev mode
const MONOREPO_ROOT = path.resolve(process.cwd(), '../..');
const SPRITES_ROOT = path.resolve(MONOREPO_ROOT, 'apps/web/public/assets/sprites');
const MANIFEST_PATH = path.resolve(MONOREPO_ROOT, 'apps/web/lib/sprite-manifest.json');

// ============================================================
// Types — MUST match frontend sprite-manifest.json format
// ============================================================

export interface PngFileInfo {
  filename: string;
  size: number;
  parsedLevel: number | null;
  isValid: boolean;
}

export interface ScanResult {
  files: string[];
  folders: string[];
}

export interface FrameData {
  fps: number;
  frames: string[];
}

export interface SpriteManifest {
  universal_egg: string;
  sprites: Record<string, Record<string, {
    images: Record<string, string>;
    animation_pools: Record<string, string[]>;
    frames?: Record<string, FrameData>;
  }>>;
}

// Level-based animation pool mapping (太阳花动画资产规范)
const ANIM_LEVEL_MAP: Record<string, string[]> = {
  'L0': ['slow_breath', 'level_up'],
  'L1-L2': ['sway', 'walk', 'play_alone', 'lie_rest', 'lie_roll', 'sleep', 'groom', 'level_up'],
  'L3-L5': ['sway', 'walk', 'play_alone', 'lie_rest', 'lie_roll', 'sleep', 'groom', 'level_up'],
  'L6-L9': ['sway', 'walk', 'play_alone', 'lie_rest', 'lie_roll', 'sleep', 'groom', 'level_up'],
};

function getPoolKey(level: number): string {
  if (level === 0) return 'L0';
  if (level <= 2) return 'L1-L2';
  if (level <= 5) return 'L3-L5';
  return 'L6-L9';
}

// ============================================================
// File Upload
// ============================================================

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/svg+xml',
  'image/jpeg',
  'image/webp',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_SIZE_BYTES * 4 / 3); // base64 ≈ 4/3 of binary
const FILENAME_REGEX = /^[a-zA-Z0-9_\-\.]+$/;

/**
 * Write a single file to disk under SPRITES_ROOT.
 */
export function uploadFile(
  basePath: string,
  filename: string,
  base64Data: string,
  mimeType: string,
): { ok: boolean; path: string } {
  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`不支持的文件类型: ${mimeType}。允许的格式: ${[...ALLOWED_MIME_TYPES].join(', ')}`);
  }

  // Validate filename
  if (!FILENAME_REGEX.test(filename)) {
    throw new Error('文件名只能包含字母、数字、下划线、连字符和点');
  }

  // Validate file size (base64 string length check)
  if (base64Data.length > MAX_BASE64_LENGTH) {
    throw new Error('文件大小超过限制（10MB）');
  }

  // Safe path and write
  const dirPath = safePath(basePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const fullPath = path.join(dirPath, filename);
  // Prevent writing outside SPRITES_ROOT (double-check after join)
  if (!fullPath.startsWith(SPRITES_ROOT)) {
    throw new Error('Invalid path: outside sprites directory');
  }

  fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));

  return { ok: true, path: `${basePath}/${filename}` };
}

// ============================================================
// Helper: ensure path is within SPRITES_ROOT
// ============================================================

function safePath(basePath: string): string {
  const resolved = path.resolve(SPRITES_ROOT, basePath);
  if (!resolved.startsWith(SPRITES_ROOT)) {
    throw new Error('Invalid path: outside sprites directory');
  }
  return resolved;
}

// ============================================================
// Core Functions
// ============================================================

/**
 * List files and folders in a given subdirectory (relative to SPRITES_ROOT)
 */
export function scanDirectory(basePath: string): ScanResult {
  const targetDir = basePath ? safePath(basePath) : SPRITES_ROOT;

  if (!fs.existsSync(targetDir)) {
    return { files: [], folders: [] };
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  return {
    files: entries.filter(e => e.isFile()).map(e => e.name),
    folders: entries.filter(e => e.isDirectory()).map(e => e.name),
  };
}

/**
 * Create a new directory (relative to SPRITES_ROOT)
 */
export function createDirectory(basePath: string): { ok: boolean; path: string } {
  const targetDir = safePath(basePath);

  if (fs.existsSync(targetDir)) {
    return { ok: false, path: targetDir };
  }

  fs.mkdirSync(targetDir, { recursive: true });
  return { ok: true, path: targetDir };
}

/**
 * Delete a directory (relative to SPRITES_ROOT)
 */
export function deleteDirectory(basePath: string, force = false): { ok: boolean } {
  const targetDir = safePath(basePath);

  if (!fs.existsSync(targetDir)) {
    return { ok: false };
  }

  if (force) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  } else {
    const entries = fs.readdirSync(targetDir);
    if (entries.length > 0) {
      throw new Error('Directory is not empty. Use force=true to delete recursively.');
    }
    fs.rmdirSync(targetDir);
  }

  return { ok: true };
}

/**
 * Rename a file or directory (relative to SPRITES_ROOT)
 */
export function renamePath(basePath: string, newName: string): { ok: boolean; newPath: string } {
  const targetPath = safePath(basePath);

  if (!fs.existsSync(targetPath)) {
    throw new Error('文件或目录不存在');
  }

  // Validate new name
  if (!/^[a-zA-Z0-9_\-\u4e00-\u9fff\.]+$/.test(newName)) {
    throw new Error('名称只能包含字母、数字、下划线、连字符、中文和点');
  }

  const parentDir = path.dirname(targetPath);
  const newPath = path.join(parentDir, newName);

  if (fs.existsSync(newPath)) {
    throw new Error('目标名称已存在');
  }

  fs.renameSync(targetPath, newPath);
  return { ok: true, newPath: `${path.dirname(basePath)}/${newName}` };
}

/**
 * Delete a single file (relative to SPRITES_ROOT)
 */
export function deleteFile(basePath: string): { ok: boolean } {
  const targetPath = safePath(basePath);

  if (!fs.existsSync(targetPath)) {
    return { ok: false };
  }

  if (fs.statSync(targetPath).isDirectory()) {
    throw new Error('不能删除目录，请使用 deleteDirectory');
  }

  fs.unlinkSync(targetPath);
  return { ok: true };
}

/**
 * Scan image files in a directory (PNG + SVG), parse level from filename
 */
export function scanPngs(basePath: string): { pngs: PngFileInfo[] } {
  const targetDir = safePath(basePath);

  if (!fs.existsSync(targetDir)) {
    return { pngs: [] };
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const pngs: PngFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = entry.name.toLowerCase();
    if (!ext.endsWith('.png') && !ext.endsWith('.svg')) continue;

    const filePath = path.join(targetDir, entry.name);
    const stat = fs.statSync(filePath);

    // Parse level from filename: e.g. "sunflower_L3.png" or "L3.svg"
    const levelMatch = entry.name.match(/_L(\d+)\.(png|svg)$/i) || entry.name.match(/^L(\d+)\.(png|svg)$/i);
    const parsedLevel = levelMatch ? parseInt(levelMatch[1], 10) : null;
    const isValid = parsedLevel !== null && parsedLevel >= 0 && parsedLevel <= 9;

    pngs.push({
      filename: entry.name,
      size: stat.size,
      parsedLevel,
      isValid,
    });
  }

  return { pngs };
}

/**
 * Regenerate sprite-manifest.json by scanning the file system.
 *
 * Output format MUST match frontend consumer:
 *   spriteManifest.sprites[species][variant].images["L0"] = "/assets/sprites/..."
 *   spriteManifest.universal_egg = "/assets/sprites/common/universal_egg.png"
 */
export function regenerateManifest(): { ok: boolean; manifest: SpriteManifest } {
  const manifest: SpriteManifest = {
    universal_egg: '',
    sprites: {},
  };

  // Check common directory for universal egg
  const commonDir = path.join(SPRITES_ROOT, 'common');
  if (fs.existsSync(commonDir)) {
    const commonEntries = fs.readdirSync(commonDir);
    const eggFile = commonEntries.find(f => f === 'universal_egg.png');
    if (eggFile) {
      manifest.universal_egg = `/assets/sprites/common/${eggFile}`;
    }
  }

  // Scan BOTH directory structures:
  // 1. {species}/{variant}/ — new format (e.g. plant/sunflower/)
  // 2. characters/{species}/{variant}/ — old format (e.g. characters/plant/sunflower/)

  const speciesDirsToScan: { basePath: string; species: string }[] = [];

  // New format: direct species dirs
  if (fs.existsSync(SPRITES_ROOT)) {
    const directSpecies = fs.readdirSync(SPRITES_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory() && !['common', 'items', 'effects', 'ui', 'placeholder', 'characters'].includes(e.name))
      .map(e => e.name);
    for (const species of directSpecies) {
      speciesDirsToScan.push({ basePath: species, species });
    }
  }

  // Old format: characters/{species}/
  const charactersDir = path.join(SPRITES_ROOT, 'characters');
  if (fs.existsSync(charactersDir)) {
    const charSpecies = fs.readdirSync(charactersDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    for (const species of charSpecies) {
      speciesDirsToScan.push({ basePath: `characters/${species}`, species });
    }
  }

  for (const { basePath, species } of speciesDirsToScan) {
    const speciesDir = path.join(SPRITES_ROOT, basePath);
    if (!fs.existsSync(speciesDir)) continue;

    const variantDirs = fs.readdirSync(speciesDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    for (const variant of variantDirs) {
      const variantDir = path.join(speciesDir, variant);
      const imageFiles = fs.readdirSync(variantDir, { withFileTypes: true })
        .filter(e => e.isFile() && (e.name.toLowerCase().endsWith('.png') || e.name.toLowerCase().endsWith('.svg')));

      // Ensure species entry exists
      if (!manifest.sprites[species]) {
        manifest.sprites[species] = {};
      }
      if (!manifest.sprites[species][variant]) {
        manifest.sprites[species][variant] = { images: {}, animation_pools: {} };
      }

      const existingEntry = manifest.sprites[species][variant];

      // Merge images — prefer PNG over SVG (PNG files are the real assets)
      for (const file of imageFiles) {
        const levelMatch = file.name.match(/_L(\d+)\.(png|svg)$/i) || file.name.match(/^L(\d+)\.(png|svg)$/i);
        if (levelMatch) {
          const level = parseInt(levelMatch[1], 10);
          if (level >= 0 && level <= 9) {
            const levelKey = `L${level}`;
            // Only overwrite if this level doesn't exist, or if the existing one is SVG and current is PNG
            const existingPath = existingEntry.images[levelKey];
            const isPng = file.name.toLowerCase().endsWith('.png');
            if (!existingPath || (isPng && !existingPath.toLowerCase().endsWith('.png'))) {
              existingEntry.images[levelKey] = `/assets/sprites/${basePath}/${variant}/${file.name}`;
            }
          }
        }
      }

      // Build animation_pools (level-based) and frames (frame sequences)
      // Only set if not already populated
      if (Object.keys(existingEntry.animation_pools).length === 0) {
        const animationsDir = path.join(variantDir, 'animations');
        if (fs.existsSync(animationsDir)) {
          const framesData: Record<string, FrameData> = {};
          const levelPools: Record<string, string[]> = {};

          // New idle/special structure: animations/{L0,L1,...,L9}/{idle|special}/{anim_name}/frame_*.png
          // Fallback to old structure: animations/{L0,L1,...,L9}/{anim_name}/frame_*.png
          const levelDirs = fs.readdirSync(animationsDir, { withFileTypes: true })
            .filter(e => e.isDirectory() && /^L\d+$/.test(e.name))
            .map(e => e.name);

          for (const levelDir of levelDirs) {
            const levelNum = parseInt(levelDir.slice(1), 10);
            if (levelNum < 0 || levelNum > 9) continue;
            const levelKey = getPoolKey(levelNum);
            const levelDirPath = path.join(animationsDir, levelDir);

            // Check for idle/ and special/ category directories
            const hasIdle = fs.existsSync(path.join(levelDirPath, 'idle')) && fs.statSync(path.join(levelDirPath, 'idle')).isDirectory();
            const hasSpecial = fs.existsSync(path.join(levelDirPath, 'special')) && fs.statSync(path.join(levelDirPath, 'special')).isDirectory();

            const categoryDirs: { name: string; path: string }[] = [];
            if (hasIdle) categoryDirs.push({ name: 'idle', path: path.join(levelDirPath, 'idle') });
            if (hasSpecial) categoryDirs.push({ name: 'special', path: path.join(levelDirPath, 'special') });

            if (categoryDirs.length > 0) {
              // Scan within each category directory
              for (const category of categoryDirs) {
                const animSubdirs = fs.readdirSync(category.path, { withFileTypes: true })
                  .filter(e => e.isDirectory())
                  .map(e => e.name);

                for (const animName of animSubdirs) {
                  const animPath = path.join(category.path, animName);
                  const frameFiles = fs.readdirSync(animPath)
                    .filter(f => f.match(/^frame_\d+\.png$/i))
                    .sort();

                  if (frameFiles.length > 0) {
                    framesData[animName] = {
                      fps: 6,
                      frames: frameFiles.map(f => `/assets/sprites/${basePath}/${variant}/animations/${levelDir}/${category.name}/${animName}/${f}`),
                    };

                    if (!levelPools[levelKey]) levelPools[levelKey] = [];
                    if (!levelPools[levelKey].includes(animName)) {
                      levelPools[levelKey].push(animName);
                    }
                  }
                }
              }
            } else {
              // Fallback: old structure without idle/special categories
              const animSubdirs = fs.readdirSync(levelDirPath, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => e.name);

              for (const animName of animSubdirs) {
                const animPath = path.join(levelDirPath, animName);
                const frameFiles = fs.readdirSync(animPath)
                  .filter(f => f.match(/^frame_\d+\.png$/i))
                  .sort();

                if (frameFiles.length > 0) {
                  framesData[animName] = {
                    fps: 6,
                    frames: frameFiles.map(f => `/assets/sprites/${basePath}/${variant}/animations/${levelDir}/${animName}/${f}`),
                  };

                  if (!levelPools[levelKey]) levelPools[levelKey] = [];
                  if (!levelPools[levelKey].includes(animName)) {
                    levelPools[levelKey].push(animName);
                  }
                }
              }
            }
          }

          // Fallback: old type-based structure: animations/{type}/{anim_name}/frame_*.png
          if (Object.keys(framesData).length === 0) {
            const allAnimNames = new Set<string>();
            const animTypes = fs.readdirSync(animationsDir, { withFileTypes: true })
              .filter(e => e.isDirectory())
              .map(e => e.name);

            for (const animType of animTypes) {
              const animTypeDir = path.join(animationsDir, animType);
              const subdirs = fs.readdirSync(animTypeDir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => e.name);

              for (const subdir of subdirs) {
                const subdirPath = path.join(animTypeDir, subdir);
                const frameFiles = fs.readdirSync(subdirPath)
                  .filter(f => f.match(/^frame_\d+\.png$/i))
                  .sort();

                if (frameFiles.length > 0) {
                  allAnimNames.add(subdir);
                  framesData[subdir] = {
                    fps: 6,
                    frames: frameFiles.map(f => `/assets/sprites/${basePath}/${variant}/animations/${animType}/${subdir}/${f}`),
                  };
                }
              }
            }

            // Build level-based pools from type-based structure using ANIM_LEVEL_MAP
            for (const [poolKey, animNames] of Object.entries(ANIM_LEVEL_MAP)) {
              const available = animNames.filter(name => allAnimNames.has(name));
              if (available.length > 0) {
                levelPools[poolKey] = available;
              }
            }
          }

          // Apply to manifest
          if (Object.keys(levelPools).length > 0) {
            existingEntry.animation_pools = levelPools;
          }
          if (Object.keys(framesData).length > 0) {
            existingEntry.frames = framesData;
          }
        }
      }
    }
  }

  // Scan items directory
  const itemsDir = path.join(SPRITES_ROOT, 'items');
  if (fs.existsSync(itemsDir)) {
    const iconsDir = path.join(itemsDir, 'icons');
    if (fs.existsSync(iconsDir)) {
      const iconFiles = fs.readdirSync(iconsDir).filter(f => f.toLowerCase().endsWith('.png'));
      for (const file of iconFiles) {
        manifest.sprites['items'] = manifest.sprites['items'] || {};
        manifest.sprites['items'][file.replace('.png', '')] = {
          images: { icon: `/assets/sprites/items/icons/${file}` },
          animation_pools: {},
        };
      }
    }
    const shopDir = path.join(itemsDir, 'shop');
    if (fs.existsSync(shopDir)) {
      const shopFiles = fs.readdirSync(shopDir).filter(f => f.toLowerCase().endsWith('.png'));
      for (const file of shopFiles) {
        manifest.sprites['shop'] = manifest.sprites['shop'] || {};
        manifest.sprites['shop'][file.replace('.png', '')] = {
          images: { shop: `/assets/sprites/items/shop/${file}` },
          animation_pools: {},
        };
      }
    }
  }

  // Write manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');

  return { ok: true, manifest };
}

/**
 * Read current manifest
 */
export function getManifest(): { manifest: SpriteManifest | null } {
  try {
    if (!fs.existsSync(MANIFEST_PATH)) {
      return { manifest: null };
    }
    const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return { manifest: JSON.parse(content) as SpriteManifest };
  } catch {
    return { manifest: null };
  }
}

/**
 * Get OS path for opening in file explorer
 */
export function getOpenPath(basePath: string): { osPath: string } {
  const targetDir = basePath ? safePath(basePath) : SPRITES_ROOT;
  return { osPath: targetDir };
}
