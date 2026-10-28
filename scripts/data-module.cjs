// Reuse the exact browser projection/write implementation for offline tools.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const cache = new Map();
function loadSourceModule(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  if (!filename.startsWith(path.resolve(__dirname, '..', 'src') + path.sep)) throw Error('Only application source modules can be loaded');
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module);
  cache.set(filename, mod);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = specifier => specifier.startsWith('.')
    ? loadSourceModule(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), specifier.endsWith('.js') ? specifier : `${specifier}.js`))) : originalRequire(specifier);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  mod._compile(code, filename);
  return mod.exports;
}
function loadDataModule(name) { return loadSourceModule(`src/data/${name}.js`); }
module.exports = { loadDataModule, loadSourceModule };
