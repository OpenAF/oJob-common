// Run from the repository root: oaf -f .github/tests/behavior-regressions.js
// Actual YAML bodies, local files/channels, and stubbed process/server operations.
ow.loadServer(); ow.loadObj(); ow.loadFormat();
var checks = 0, failures = 0;
function check(name, fn) {
  checks++;
  try { fn(); print('PASS ' + name); }
  catch(e) { failures++; printErr('FAIL ' + name + ': ' + e + '\n' + e.stack); }
}
function equal(actual, expected) {
  if (actual !== expected) throw 'Expected ' + stringify(expected) + ', got ' + stringify(actual);
}
function body(file, name) { return io.readFileYAML(file).jobs.filter(j => j.name == name)[0].exec; }
function fixture(fn) {
  var dir = String(java.nio.file.Files.createTempDirectory('ojob-behavior-'));
  try { fn(dir); } finally { io.rm(dir); }
}
function path(file) { return new java.io.File(file).toPath(); }
var files = java.nio.file.Files, modes = java.nio.file.attribute.PosixFilePermissions;
var replacements = [
  { name: 'Find & Replace by line', job: 'IO Find & Replace', args: { byline: true } },
  { name: 'Find & Replace whole file', job: 'IO Find & Replace', args: { byline: false } },
  { name: 'Modify text file', job: 'IO Modify text file', args: {} }
];
replacements.forEach(function(spec) {
  function replace(file, overrides, fakeIO) {
    var args = merge({ file: file, target: file, find: 'old', search: 'old', replace: 'new' }, spec.args);
    args = merge(args, overrides || {});
    new Function('args', 'io', body('oJobIO.yaml', spec.job))(args, fakeIO || io);
  }
  check(spec.name + ' preserves file permissions and ownership', function() {
    fixture(function(dir) {
      var file = dir + '/input';
      io.writeFileString(file, 'old\n');
      ['rwxr-xr-x', 'rw-r-----'].forEach(function(mode) {
        files.setPosixFilePermissions(path(file), modes.fromString(mode));
        var owner = String(files.getOwner(path(file)));
        var group = String(files.readAttributes(path(file), java.nio.file.attribute.PosixFileAttributes).group());
        replace(file);
        equal(io.readFileString(file), 'new\n');
        equal(String(modes.toString(files.getPosixFilePermissions(path(file)))), mode);
        equal(String(files.getOwner(path(file))), owner);
        equal(String(files.readAttributes(path(file), java.nio.file.attribute.PosixFileAttributes).group()), group);
        equal(io.listFiles(dir).files.length, 1);
        io.writeFileString(file, 'old\n');
      });
    });
  });
  check(spec.name + ' follows a relative symlink and retains the link', function() {
    fixture(function(dir) {
      var target = dir + '/target', link = dir + '/link';
      io.writeFileString(target, 'old\n');
      files.createSymbolicLink(path(link), path('target'));
      replace(link);
      equal(files.isSymbolicLink(path(link)), true);
      equal(String(files.readSymbolicLink(path(link))), 'target');
      equal(io.readFileString(target), 'new\n');
      equal(io.readFileString(link), 'new\n');
      equal(io.listFiles(dir).files.length, 2);
    });
  });
  if (spec.args.byline !== false) {
    check(spec.name + ' preserves symlink and target when staging fails', function() {
      fixture(function(dir) {
        var target = dir + '/target', link = dir + '/link', error = new Error('staging failed'), caught;
        io.writeFileString(target, 'old\n');
        files.createSymbolicLink(path(link), path('target'));
        var fakeIO = {};
        ['fileExists', 'readFileString', 'getCanonicalPath', 'createTempFile', 'mv', 'rm', 'readFileStream'].forEach(function(method) {
          fakeIO[method] = function() { return io[method].apply(io, arguments); };
        });
        fakeIO.cp = function() { throw error; };
        try { replace(link, {}, fakeIO); } catch(e) { caught = e; }
        equal(caught, error);
        equal(files.isSymbolicLink(path(link)), true);
        equal(io.readFileString(target), 'old\n');
        equal(io.listFiles(dir).files.length, 2);
      });
    });
  }
});

var watchdogBody = body('oJobWatchDog.yaml', 'oJob WatchDog');
function watchdog(args, running) {
  var commands = [], scheduled = [];
  var runtime = { loadFormat: function() { return ow.loadFormat(); }, oJob: {
    add2Todo: function(job) { scheduled.push({ name: job.name, phase: job.args.__watchdog.phase }); }
  } };
  new Function('args', 'sh', 'ow', 'pidCheck', 'log', 'logWarn', 'logErr', watchdogBody)(
    args, function(cmd) { commands.push(cmd); return { exitcode: 0 }; }, runtime,
    function() { return running === true; }, function() {}, function() {}, function() {}
  );
  return { state: args.__watchdog, commands: commands, scheduled: scheduled };
}
check('WatchDog restarts for an old log without pattern/history settings', function() {
  fixture(function(dir) {
    var file = dir + '/app.log';
    io.writeFileString(file, 'healthy\n');
    new java.io.File(file).setLastModified(now() - 120000);
    var r = watchdog({ checks: { log: { folder: dir, fileRE: '^app\\.log$', olderMin: 1 } }, cmdToStart: 'start' });
    equal(r.state.shouldRestart, true); equal(r.state.phase, 'start');
    equal(r.commands.join(','), 'start');
  });
});
check('WatchDog accepts age-only checks with logging enabled', function() {
  fixture(function(dir) {
    io.writeFileString(dir + '/app.log', 'healthy\n');
    var r = watchdog({ checks: { log: { folder: dir, fileRE: '^app\\.log$', olderMin: 60 } }, quiet: false, cmdToStart: 'start' });
    equal(r.state.shouldRestart, false); equal(r.commands.length, 0);
  });
});
['cmd', 'exec', 'job'].forEach(function(kind) {
  check('WatchDog recovers a missing PID using ' + kind + 'ToStart', function() {
    fixture(function(dir) {
      var args = { checks: { pid: { file: dir + '/missing.pid' } } };
      if (kind == 'cmd') args.cmdToStart = 'start';
      if (kind == 'exec') args.execToStart = '42';
      if (kind == 'job') args.jobToStart = 'start-job';
      var r = watchdog(args);
      equal(r.state.shouldRestart, true); equal(r.state.phase, 'start');
      if (kind == 'cmd') equal(r.commands.join(','), 'start');
      if (kind == 'exec') equal(r.state.execToStart, 42);
      if (kind == 'job') equal(r.scheduled[0].name, 'start-job');
    });
  });
});
check('WatchDog does not restart a healthy PID', function() {
  fixture(function(dir) {
    io.writeFileString(dir + '/app.pid', '123\n');
    var r = watchdog({ checks: { pid: { file: dir + '/app.pid' } }, cmdToStart: 'start' }, true);
    equal(r.state.shouldRestart, false); equal(r.commands.length, 0);
  });
});
check('WatchDog pattern checks work without olderMin and do not replay history', function() {
  fixture(function(dir) {
    io.writeFileString(dir + '/app.log', 'FATAL\nhealthy\n');
    var args = { checks: { log: { folder: dir, fileRE: '^app\\.log$', histFile: dir + '/history.json', stringRE: 'FATAL' } }, cmdToStart: 'start' };
    var first = watchdog(clone(args));
    equal(first.state.shouldRestart, true); equal(first.commands.join(','), 'start');
    var next = watchdog(clone(args));
    equal(next.state.shouldRestart, false); equal(next.commands.length, 0);
    io.writeFileString(dir + '/app.log', 'FATAL again\n', __, true);
    var last = watchdog(clone(args));
    equal(last.state.shouldRestart, true); equal(last.commands.join(','), 'start');
  });
});
check('WatchDog STOP performs stop actions without starting', function() {
  var r = watchdog({ STOP: true, cmdToStop: 'stop', cmdToStart: 'start' });
  equal(r.commands.join(','), 'stop'); equal(r.state.phase, 'stop');
});

var startBuffer = new Function('args', body('oJobCh.yaml', 'oJob Ch Start Buffering'));
var stopBuffer = new Function('args', body('oJobCh.yaml', 'oJob Ch Stop Buffering'));
function channels(fn) {
  var source = 'ojob-behavior-' + genUUID(), target = source + '-target';
  $ch(source).create(); $ch(target).create();
  try { fn(source, target); }
  finally {
    $ch(source).waitForJobs(3000);
    ow.ch.unsubscribeAll(source);
    if ($ch().list().indexOf(source + '::__bufferTransit') >= 0) ow.ch.utils.closeBuffer(source + '::__bufferTransit');
    $ch(source).destroy(); $ch(target).destroy();
    if (isDef(global.__ojobcommon) && isDef(global.__ojobcommon.bufferSubs)) delete global.__ojobcommon.bufferSubs[source];
  }
}
function drain(source, target) {
  $ch(source).waitForJobs(3000);
  $ch(source + '::__bufferTransit').waitForJobs(3000);
  if ($ch().list().indexOf(source + '::__bufferTarget') >= 0) $ch(source + '::__bufferTarget').waitForJobs(3000);
  $ch(target).waitForJobs(3000);
}
check('buffer filter strings accept and reject records without failing startup', function() {
  channels(function(source, target) {
    startBuffer({ source: source, target: target, id: 'id', byNumber: 1, byTimeInMs: -1,
      filterFunc: 'return arguments[3].keep === true;' });
    $ch(source).set({ id: 1 }, { id: 1, keep: false });
    $ch(source).set({ id: 2 }, { id: 2, keep: true });
    drain(source, target);
    equal($ch(target).getAll().length, 1); equal($ch(target).get({ id: 2 }).keep, true);
  });
});
check('false bufferFunc retains records and shutdown flushes them', function() {
  channels(function(source, target) {
    startBuffer({ source: source, target: target, id: 'id', byNumber: 100, byTimeInMs: -1, bufferFunc: 'return false;' });
    $ch(source).set({ id: 1 }, { id: 1 });
    drain(source, target);
    equal($ch(target).size(), 0);
    stopBuffer({ source: source, target: target });
    $ch(target).waitForJobs(3000);
    equal($ch(target).get({ id: 1 }).id, 1);
  });
});
check('true bufferFunc flushes before the count threshold', function() {
  channels(function(source, target) {
    startBuffer({ source: source, target: target, id: 'id', byNumber: 100, byTimeInMs: -1, bufferFunc: 'return true;' });
    $ch(source).set({ id: 1 }, { id: 1 });
    drain(source, target);
    equal($ch(target).get({ id: 1 }).id, 1);
  });
});
check('stop removes every buffer subscription and allows restart', function() {
  channels(function(source, target) {
    function start() { startBuffer({ source: source, target: target, id: 'id', byNumber: 1, byTimeInMs: -1 }); }
    start(); start();
    equal(Object.keys(ow.ch.subscribers[source]).length, 2);
    stopBuffer({ source: source, target: target });
    equal(Object.keys(ow.ch.subscribers[source]).length, 0);
    equal($ch().list().indexOf(source + '::__bufferTransit'), -1);
    stopBuffer({ source: source, target: target });
    start();
    $ch(source).set({ id: 3 }, { id: 3 });
    drain(source, target);
    equal($ch(target).get({ id: 3 }).id, 3);
    stopBuffer({ source: source, target: target });
    equal(Object.keys(ow.ch.subscribers[source]).length, 0);
  });
});

check('A2B delivers each batch through the documented values parameter', function() {
  global.__ojobBehaviorBatches = new java.util.concurrent.ConcurrentLinkedQueue();
  var errors = [];
  try {
    new Function('args', '$doA2B', body('oJobBasics.yaml', 'oJob A2B'))(
      { A: 'fn([1, 2]); fn([3, 4]);', B: 'global.__ojobBehaviorBatches.add(values.join(","));', numThreads: 2, timeout: 10 },
      function(A, B, n, t) { $doA2B(A, B, n, t, function(e) { errors.push(String(e)); }); }
    );
    equal(errors.length, 0);
    equal(global.__ojobBehaviorBatches.size(), 2);
    equal(global.__ojobBehaviorBatches.contains('1,2'), true);
    equal(global.__ojobBehaviorBatches.contains('3,4'), true);
  } finally { delete global.__ojobBehaviorBatches; }
});
['supplied', 'default'].forEach(function(kind) {
  check('REST Start Server uses the ' + kind + ' server', function() {
    var state = {}, server = { fixture: true }, starts = 0, args = { port: 12345 };
    if (kind == 'supplied') args.hs = server;
    var runtime = { loadServer: function() {}, loadTemplate: function() {}, server: { httpd: {
      start: function(port) { starts++; equal(port, 12345); return server; }
    } } };
    new Function('args', '__pmIn', 'ow', '$do', body('oJobRest.yaml', 'REST Start Server'))(
      args, state, runtime, function(fn) { fn(); }
    );
    equal(state.__ojobHttp[12345], server); equal(starts, kind == 'supplied' ? 0 : 1);
  });
});
print(checks + ' checks, ' + failures + ' failures');
exit(failures ? 1 : 0);
