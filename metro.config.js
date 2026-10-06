// Metro の設定（Expo の標準に、three.js の読み込み先の直しだけを足す）
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// three.js の require 用の入口（build/three.cjs）は、最初に process.emitWarning（Node.js にしかない）を呼ぶ。
// スマホ（React Native）では undefined なので「undefined is not a function」で止まる（2026-10-05、島の画面）。
// @react-three/fiber のスマホ用は require('three') で読むため、three は必ず ESM の入口（three.module.js）に向ける
const THREE_ESM = path.resolve(__dirname, 'node_modules/three/build/three.module.js');
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: THREE_ESM };
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
