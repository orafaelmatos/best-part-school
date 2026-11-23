import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Deterministic platform exports from the school's existing logo.
const logo = 'public/img/bps-logo.png';
const run = (...args) => {
  const result = spawnSync('sips', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'sips failed');
};
function exportLogo(output, width, height = width, logoSize = Math.round(Math.min(width, height) * .8)) {
  run('-s', 'format', 'png', '-z', String(logoSize), String(logoSize), logo, '--out', output);
  run('-p', String(height), String(width), '--padColor', 'F6F7FB', output, '--out', output);
}
mkdirSync('assets/mobile', { recursive: true });
mkdirSync('docs/store-assets', { recursive: true });
exportLogo('assets/mobile/icon.png', 1024);
exportLogo('docs/store-assets/google-play-icon-512.png', 512);
exportLogo('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024);
for (const entry of readdirSync('ios/App/App/Assets.xcassets/Splash.imageset')) {
  if (entry.endsWith('.png')) exportLogo(join('ios/App/App/Assets.xcassets/Splash.imageset', entry), 2732, 2732, 650);
}
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, scale] of Object.entries(densities)) {
  const directory = `android/app/src/main/res/mipmap-${density}`;
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) exportLogo(join(directory, name), Math.round(48 * scale));
  exportLogo(join(directory, 'ic_launcher_foreground.png'), Math.round(108 * scale), Math.round(108 * scale), Math.round(64 * scale));
}
for (const directory of readdirSync('android/app/src/main/res')) {
  const path = join('android/app/src/main/res', directory, 'splash.png');
  if (!directory.startsWith('drawable') || directory.includes('v24')) continue;
  const result = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], { encoding: 'utf8' });
  const width = Number(result.stdout.match(/pixelWidth: (\d+)/)?.[1]);
  const height = Number(result.stdout.match(/pixelHeight: (\d+)/)?.[1]);
  if (width && height) exportLogo(path, width, height, Math.round(Math.min(width, height) * .28));
}
console.log('Mobile icons and splash screens generated from public/img/bps-logo.png');
