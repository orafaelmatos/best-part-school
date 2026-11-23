import { readFileSync, writeFileSync } from 'node:fs';
const [version, build] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !/^[1-9]\d*$/.test(build || '') || Number(build) > 2100000000) {
  throw new Error('Use: npm run mobile:version -- 1.0.0 1. O build deve crescer a cada envio.');
}
for (const path of ['package.json', 'package-lock.json']) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
const android = 'android/app/build.gradle';
writeFileSync(android, readFileSync(android, 'utf8').replace(/versionCode \d+/, `versionCode ${build}`).replace(/versionName "[^"]+"/, `versionName "${version}"`));
const ios = 'ios/App/App.xcodeproj/project.pbxproj';
writeFileSync(ios, readFileSync(ios, 'utf8').replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`).replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`));
console.log(`Android/iOS: versão ${version}, build ${build}`);
