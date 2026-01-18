import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SDKConfigLoader } from '../../src/config/SDKConfigLoader';

const TEMP_DIR_PREFIX =
  process.env.CHECKPOINT_CONFIG_TEMP_DIR_PREFIX || 'checkpoint-config-';
const JSON_INDENT = parseInt(process.env.CHECKPOINT_CONFIG_JSON_INDENT || '2', 10);

describe('checkpoint configuration', () => {
  let tempDir: string;
  let configPath: string;
  let loader: SDKConfigLoader;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
    configPath = path.join(tempDir, '.claude', 'settings.json');
    loader = new SDKConfigLoader();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('ignores checkpoint options from project config', async () => {
    const config = {
      enableFileCheckpointing: false,
      checkpointKeepCount: 12,
    };

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, JSON_INDENT));

    const projectConfig = await loader.loadProjectConfig(tempDir);

    const configValues = projectConfig as Record<string, unknown>;
    expect(configValues.enableFileCheckpointing).toBeUndefined();
    expect(configValues.checkpointKeepCount).toBeUndefined();
  });

  it('does not add checkpoint defaults when config is missing', async () => {
    const projectConfig = await loader.loadProjectConfig(tempDir);
    const configValues = projectConfig as Record<string, unknown>;
    expect(configValues.enableFileCheckpointing).toBeUndefined();
    expect(configValues.checkpointKeepCount).toBeUndefined();
  });
});
