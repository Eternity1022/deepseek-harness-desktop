// 用 @electron/packager 打包为自包含的 Windows 桌面应用（无需安装器，绿色便携版）。
const packager = require('@electron/packager');
const path = require('path');

(async () => {
  const appPaths = await packager({
    dir: __dirname,
    name: 'DeepSeek Harness',
    platform: 'win32',
    arch: 'x64',
    out: path.join(__dirname, 'dist'),
    overwrite: true,
    asar: false,
    prune: true,
    download: {
      cacheRoot: path.join(__dirname, '.electron-cache'),
      mirrorOptions: {
        mirror: 'https://npmmirror.com/mirrors/electron/',
        customDir: 'v43.4.0'
      }
    },
    ignore: [
      /^\/data(\/|$)/,            // 用户数据目录，不打包进应用
      /^\/cache(\/|$)/,           // 下载缓存
      /^\/\.npm-cache(\/|$)/,
      /^\/\.electron-cache(\/|$)/,
      /^\/dist(\/|$)/,            // 打包输出目录自身
      /\.log$/,                   // 各类日志
      /^\/download\.js$/,         // 构建辅助脚本
      /^\/package\.js$/,
      /^\/start\.bat$/            // 开发态启动脚本，仅源码运行需要
    ]
  });
  console.log('PACKAGED:');
  for (const p of appPaths) console.log('  ' + p);
})().catch((err) => {
  console.error('PACKAGE_FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
