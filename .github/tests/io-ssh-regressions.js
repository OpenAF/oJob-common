// Run from the repository root: oaf -f .github/tests/io-ssh-regressions.js
var checks = 0, failures = 0;
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
var modifyBody = body('oJobIO.yaml', 'IO Modify text file');
var modify = new Function('args', modifyBody);
var dir = String(java.nio.file.Files.createTempDirectory('ojob-io-ssh-'));
function fileCase(name, input, find, replacement, expected, operation) {
  check(name, function() {
    var path = dir + '/input.txt';
    io.writeFileString(path, input);
    var args = { file: path, find: find, replace: replacement };
    modify(args);
    equal(io.readFileString(path), expected);
    equal(args.op, operation || 'replace');
    equal(io.listFiles(dir).files.length, 1);
  });
}
try {
  fileCase('single-line search without trailing newline', 'before\nold\nafter\n', 'old', 'new', 'before\nnew\nafter\n');
  fileCase('multiline search retains its final line', 'one\ntwo\nkeep\n', 'one\ntwo', 'new', 'new\nkeep\n');
  fileCase('partial block must not replace unmatched lines', 'one\nother\n', 'one\ntwo', 'new', 'one\nother\nnew', 'append');
  fileCase('overlapping prefix finds full block', 'a\na\nb\n', 'a\nb\n', 'new\n', 'a\nnew\n');
  fileCase('replacement is literal and only affects first occurrence', 'old old\r\nlast', 'old', '$&漢字', '$&漢字 old\r\nlast');
  fileCase('missing match appends', 'original', 'absent', ' appended', 'original appended', 'append');
  check('missing file is created', function() {
    var path = dir + '/input.txt';
    io.rm(path);
    var args = { file: path, find: 'old', replace: 'new' };
    modify(args);
    equal(io.readFileString(path), 'new');
    equal(args.op, 'create');
  });
  check('failed replacement preserves original and cleans temporary file', function() {
    var path = dir + '/input.txt';
    io.writeFileString(path, 'old\n');
    var fakeIO = {}, error = new Error('write failed'), caught;
    ['fileExists', 'readFileString', 'getCanonicalPath', 'createTempFile', 'mv', 'rm'].forEach(function(method) {
      fakeIO[method] = function() { return io[method].apply(io, arguments); };
    });
    fakeIO.writeFileString = function() { throw error; };
    var run = new Function('args', 'io', modifyBody);
    try { run({ file: path, find: 'old\n', replace: 'new\n' }, fakeIO); }
    catch (e) { caught = e; }
    equal(caught, error);
    equal(io.readFileString(path), 'old\n');
    equal(io.listFiles(dir).files.length, 1);
  });
} finally { io.rm(dir); }

function runSSH(name, args, channels, failure, exitcode) {
  var opened = [], closed = 0, calls = 0;
  function SSH(host) {
    opened.push(host);
    this.close = function() { closed++; };
    this.exec = this.execSudo = this.put = this.get = function() {
      calls++;
      if (failure) throw failure;
      return { stdout: 'out', stderr: '', exitcode: exitcode || 0 };
    };
  }
  function ch(name) {
    return { list: function() { return channels; }, getAll: function() {
      if (channels.indexOf(name) < 0) throw 'Missing channel ' + name;
      return [{ host: 'channel-host' }];
    } };
  }
  var run = new Function('args', 'SSH', '$ch', 'plugin', 'log', body('oJobSSH.yaml', name));
  var caught;
  try { run(args, SSH, ch, function() {}, function() {}); }
  catch (e) { caught = e; }
  return { opened: opened, closed: closed, calls: calls, error: caught };
}
['SSH Exec', 'SSH Send file', 'SSH Get file'].forEach(function(name) {
  check(name + ' uses default hosts channel at index zero', function() {
    var res = runSSH(name, { cmd: 'true', quiet: true }, ['hosts']);
    equal(res.error, undefined);
    equal(res.opened[0], 'channel-host');
    equal(res.closed, 1);
  });
  check(name + ' does not select a nonexistent hosts channel', function() {
    var args = { cmd: 'true', quiet: true };
    runSSH(name, args, ['other']);
    equal(args.chHosts, undefined);
  });
  check(name + ' respects an explicit host', function() {
    var res = runSSH(name, { host: 'explicit', cmd: 'true', quiet: true }, ['hosts']);
    equal(res.error, undefined);
    equal(res.opened[0], 'explicit');
    equal(res.closed, 1);
  });
  [false, true].forEach(function(channel) {
    check(name + ' closes on failure (' + (channel ? 'channel' : 'direct') + ')', function() {
      var error = new Error('operation failed');
      var args = { cmd: 'true', quiet: true };
      if (channel) args.chHosts = 'hosts'; else args.host = 'direct';
      var res = runSSH(name, args, ['hosts'], error);
      equal(res.error, error);
      equal(res.closed, 1);
    });
  });
});
[false, true].forEach(function(channel) {
  [false, true].forEach(function(array) {
    check('SSH Exec closes on nonzero exit (' + channel + ', ' + array + ')', function() {
      var args = { cmd: array ? ['false', 'true'] : 'false', quiet: true };
      if (channel) args.chHosts = 'hosts'; else args.host = 'direct';
      var res = runSSH('SSH Exec', args, ['hosts'], undefined, 1);
      equal(isDef(res.error), true);
      equal(res.calls, 1);
      equal(res.closed, 1);
    });
  });
});
print(checks + ' checks, ' + failures + ' failures');
exit(failures ? 1 : 0);
