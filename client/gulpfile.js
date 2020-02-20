const dumber = require('gulp-dumber');
const auDepsFinder = require('aurelia-deps-finder');
const del = require('del');
const fs = require('fs');
const gulp = require('gulp');
const babel = require('gulp-babel');
const sass = require('gulp-sass');
const plumber = require('gulp-plumber');
const merge2 = require('merge2');
const postcss = require('gulp-postcss');
const terser = require('gulp-terser');
const gulpif = require('gulp-if');
const autoprefixer = require('autoprefixer');
const postcssUrl = require('postcss-url');

const {NODE_ENV} = process.env;

const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const domainSubfix = isProd ? 'app' : 'local';
const hostnames = {
  host: `gist.dumber.${domainSubfix}`,
  clientUrl: `https://gist.dumber.${domainSubfix}`,
  cacheUrl: `https://cache.dumber.${domainSubfix}`,
  oauthUrl: `https://github-oauth.gist.dumber.${domainSubfix}`
};
const HOST_NAMES = `;var HOST_NAMES = ${JSON.stringify(hostnames)};`;

const finalBundleNames = {};

const drApp = dumber({
  src: 'src',
  depsFinder: auDepsFinder,
  hash: isProd && !isTest,
  prepend: [
    HOST_NAMES
  ],
  append: [
    isTest && "requirejs(['../test/setup', /^\\.\\.\\/test\\/.+\\.spec$/]);"
  ],
  codeSplit: isTest ? undefined : (moduleId, packageName) => {
    if (!packageName) return 'app-bundle';
    if (packageName === 'codemirror') return 'codemirror-bundle';
    return 'deps-bundle';
  },
  onManifest: isTest ? undefined : filenameMap => {
    finalBundleNames['entry-bundle.js'] = filenameMap['entry-bundle.js'];
  }
});

function clean() {
  return del(['dist', 'index.html']);
}

exports.clean = clean;

// clear dumber (tracing) cache
exports['clean-cache'] = function () {
  return drApp.clearCache();
};

function buildJs(src) {
  const transpile = babel();

  return gulp.src(src, {sourcemaps: !isProd, since: gulp.lastRun(buildApp)})
  .pipe(gulpif(!isProd, plumber()))
  .pipe(transpile);
}

function buildCss(src) {
  return gulp.src(src, {sourcemaps: !isProd})
  .pipe(sass().on('error', sass.logError))
  .pipe(postcss([
    autoprefixer(),
    postcssUrl({url: 'inline', encodeType: 'base64'})
  ]));
}

function buildApp() {
  return merge2(
    gulp.src('src/**/*.{json,html}', {since: gulp.lastRun(buildApp)}),
    buildJs(isTest ? '{src,test}/**/*.js' : 'src/**/*.js'),
    buildCss('src/**/*.scss')
  )
  .pipe(drApp())
  .pipe(gulpif(isProd, terser({compress: false})))
  .pipe(gulp.dest('dist', {sourcemaps: isProd ? false : (isTest ? true : '.')}));
}

exports.buildApp = buildApp;

const drWorker = dumber({
  src: 'src-worker',
  hash: isProd,
  entryBundle: 'bundler-worker',
  prepend: [
    HOST_NAMES,
    require.resolve('sass.js/dist/sass.sync.js')
  ],
  deps: [
    // semver main index.js uses special lazyRequire which can not
    // be statically analyzed, we need explicit require for bundler
    // to work.
    {name: 'semver', main: 'preload.js'}
  ],
  append: [
    isTest ?
      `requirejs(['../test-worker/setup', /^\\.\\.\\/test-worker\\/.+\\.spec$/]).catch(console.error);` :
      "requirejs(['index']);"
  ],
  codeSplit: isTest ? undefined : (moduleId, packageName) => {
    if (packageName === 'typescript') return 'bundler-ts';
    if (packageName) return 'bundler-other-deps';
  },
  onManifest: function(filenameMap) {
    finalBundleNames['bundler-worker.js'] = filenameMap['bundler-worker.js'];
  }
});

function _buildWorker() {
  return gulp.src(
    isTest ? '{src-worker,test-worker}/**/*.js' : 'src-worker/**/*.js',
    {sourcemaps: !isProd, since: gulp.lastRun(buildWorker)}
  )
    .pipe(gulpif(!isProd, plumber()))
    .pipe(babel())
    .pipe(drWorker())
    .pipe(gulpif(isProd, terser({compress: false, mangle: false})))
    .pipe(gulp.dest('dist', {sourcemaps: isProd ? false : (isTest ? true : '.')}));
}

function _cleanupEnv() {
  if (isProd) process.env.NODE_ENV = '';
  return Promise.resolve();
}

function _restoreEnv() {
  if (isProd) process.env.NODE_ENV = 'production';
  return Promise.resolve();
}

// Have to build worker (dumber bundler in browser) with
// NODE_ENV as "", because we want dumber to run in "development"
// mode in browser for dumber gist.
const buildWorker = gulp.series(
  _cleanupEnv,
  _buildWorker,
  _restoreEnv
);

exports.buildWorker = buildWorker;

function writeIndex() {
  const indexHtml = fs.readFileSync('_index.html', 'utf-8')
    .replace('entry-bundle.js', finalBundleNames['entry-bundle.js'])
    .replace('bundler-worker.js', finalBundleNames['bundler-worker.js']);
  fs.writeFileSync('index.html', indexHtml);
  return Promise.resolve();
}

const build = gulp.series(
  clean,
  buildApp,
  buildWorker,
  writeIndex,
);

exports.build = build;

function watch() {
  gulp.watch('src/**/*', buildApp);
  gulp.watch('src-worker/**/*', buildWorker);
}

exports.watch = gulp.series(
  build,
  watch
);

exports.default = exports.watch;
