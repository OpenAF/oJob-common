// Run from the repository root: oaf -f .github/tests/runtime-regressions.js
var failures = 0, checks = 0;
function check(name, fn) {
  checks++;
  try { fn(); print('PASS ' + name); }
  catch (e) { failures++; printErr('FAIL ' + name + ': ' + e); }
}
function equal(actual, expected) {
  if (actual !== expected) throw 'Expected ' + stringify(expected) + ', got ' + stringify(actual);
}
function body(file, name) {
  return io.readFileYAML(file).jobs.filter(j => j.name == name)[0].exec;
}
var replace = new Function('args', body('oJobIO.yaml', 'IO Find & Replace'));
var dir = String(java.nio.file.Files.createTempDirectory('ojob-regression-'));
function fileCase(name, input, options, expected) {
  check(name, function() {
    var path = dir + '/input.txt';
    io.writeFileString(path, input);
    replace(merge({ target: path, search: 'a', replace: 'b' }, options));
    equal(io.readFileString(path), expected);
    equal(io.listFiles(dir).files.length, 1);
  });
}
try {
  fileCase('absolute path replacement', 'a\n', {}, 'b\n');
  fileCase('global and case insensitive flags', 'AaA\n', { flags: 'gi' }, 'bbb\n');
  fileCase('longer replacement', 'a\n', { replace: 'a much longer replacement' }, 'a much longer replacement\n');
  fileCase('UTF-8 replacement', 'a\n', { replace: '漢字é' }, '漢字é\n');
  fileCase('whole-file mode', 'a\na', { byline: false, flags: 'g' }, 'b\nb');
  check('write failure preserves original and removes temporary file', function() {
    var path = dir + '/input.txt';
    io.writeFileString(path, 'original\n');
    var failingReplace = new Function('args', 'ioStreamWrite', body('oJobIO.yaml', 'IO Find & Replace'));
    var caught;
    try {
      failingReplace({ target: path, search: 'original', replace: 'changed' }, function() { throw 'write failed'; });
    } catch (e) { caught = e; }
    equal(caught, 'write failed');
    equal(io.readFileString(path), 'original\n');
    equal(io.listFiles(dir).files.length, 1);
  });
  check('invalid regexp preserves original and leaves no temporary file', function() {
    var path = dir + '/input.txt';
    io.writeFileString(path, 'original\n');
    var threw = false;
    try { replace({ target: path, search: '[', replace: 'x' }); } catch (e) { threw = true; }
    equal(threw, true);
    equal(io.readFileString(path), 'original\n');
    equal(io.listFiles(dir).files.length, 1);
  });
} finally { io.rm(dir); }

ow.loadOJob();
var oldGet = ow.oJob.getMetric, oldSet = ow.oJob.setMetric;
var metric = { exception: 'previous connection failure', error: 1 };
ow.oJob.getMetric = function() { return metric; };
ow.oJob.setMetric = function(id, value) { metric = value; };
try {
  var connect = new Function('args', 'DB', body('oJobSQL.yaml', 'SQL'));
  check('SQL connection recovers after a previous metric error', function() {
    var args = { DBURL: 'test', DBUser: 'test', DBPass: 'test', sql: 'select 1', metric: 'db' };
    connect(args, function() { this.connected = true; });
    equal(args._db.connected, true);
    equal(metric.error, 1);
  });
  check('SQL propagates the current connection error', function() {
    var error = new Error('current connection failure'), caught;
    try {
      connect({ DBURL: 'test', DBUser: 'test', DBPass: 'test', sql: 'select 1', metric: 'db' }, function() { throw error; });
    } catch (e) { caught = e; }
    equal(caught, error);
    equal(metric.exception, String(error));
  });
} finally {
  ow.oJob.getMetric = oldGet;
  ow.oJob.setMetric = oldSet;
}
print(checks + ' checks, ' + failures + ' failures');
exit(failures ? 1 : 0);
