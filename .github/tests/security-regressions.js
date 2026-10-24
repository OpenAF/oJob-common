// Run from the repository root: oaf -f .github/tests/security-regressions.js
// No listeners or external services: execute the actual YAML handlers on local fixtures.
ow.loadServer(); ow.loadTemplate(); ow.loadFormat();
var checks = 0, failures = 0;
function check(name, fn) {
  checks++;
  try { fn(); print('PASS ' + name); }
  catch(e) { failures++; printErr('FAIL ' + name + ': ' + e + '\n' + e.stack); }
}
function equal(a, b) { if (a !== b) throw 'Expected ' + stringify(b) + ', got ' + stringify(a); }
function denied(fn) { var caught = false; try { fn(); } catch(e) { caught = true; } equal(caught, true); }
function job(file, name) { return io.readFileYAML(file).jobs.filter(j => j.name == name)[0]; }
function run(file, name, args) { new Function('args', job(file, name).exec)(args); return args; }
var dir = String(java.nio.file.Files.createTempDirectory('ojob-security-'));
dir = String(new java.io.File(dir).getCanonicalPath());
var root = dir + '/public', port = 18091;
io.mkdir(root); io.mkdir(root + '/nested'); io.mkdir(dir + '/public-sibling');
io.writeFileString(dir + '/private.json', '{"secret":true}');
io.writeFileString(root + '/ok.json', '{"ok":true}');
io.writeFileString(root + '/hidden.json', '{"secret":true}');
io.writeFileString(root + '/nested/index.md', '# Default document');
io.writeFileString(root + '/percent%2e+name.txt', 'literal');
java.nio.file.Files.createSymbolicLink(new java.io.File(root + '/outside').toPath(), new java.io.File(dir).toPath());
var server = {
  reply: function(data, mime, status) { return { data: data, mimetype: mime, status: status || 200 }; },
  replyOKHTML: function(data) { return this.reply(String(data), 'text/html', 200); },
  replyOKJSON: function(data) { return this.reply(data, 'application/json', 200); },
  replyStream: function(stream, mime) { return { stream: stream, mimetype: mime, status: 200 }; }
};
function request(uri, params) { return { uri: uri, originalURI: uri, method: 'GET', params: params || {}, header: {} }; }
function fileHandler(options) {
  var args = merge({ port: port, uri: '/a.b', path: root, browse: true, incURI: false, sortTab: false }, options || {});
  var def = job('oJobHTTPd.yaml', 'HTTP File Browse');
  new Function('args', def.exec)(args);
  return function(req) { return new Function('request', 'server', 'port', 'uri', def.args.execURI)(req, server, port, args.uri); };
}
function consume(result) { if (result.stream) { var text = af.fromBytes2String(result.stream.readAllBytes()); result.stream.close(); return String(text); } return String(result.data); }
try {
  run('oJobHTTPd.yaml', 'HTTP Start Server', { port: port, hs: server });
  ['HTTP Service', 'HTTP SSE Service'].forEach(function(name) {
    check(name + ' preserves explicit and default auth including explicit empty override', function() {
      global.__ojobPreRoutes[port] = 'return { status: 402 };';
      [undefined, '', 'return { status: 401 };'].forEach(function(pre) {
        var args = { port: port, uri: '/auth', audit: false, execURI: 'return {status:200};', execSSE: 'global.__securitySSEExecuted = true;' };
        if (pre !== undefined) args.execPre = pre;
        run('oJobHTTPd.yaml', name, args);
        equal(args.execPre, pre === undefined ? global.__ojobPreRoutes[port] : pre);
        if (name == 'HTTP Service') equal(global.__ojobRoutes[port]['/auth'](request('/auth')).status, pre === '' ? 200 : (pre === undefined ? 402 : 401));
      });
    });
  });
  check('SSE explicit rejection prevents protected handler execution', function() {
    global.__securitySSEExecuted = false;
    run('oJobHTTPd.yaml', 'HTTP SSE Service', { port: port, uri: '/auth', audit: false, execPre: 'return;', execSSE: 'global.__securitySSEExecuted = true; writer.write("secret", "leak");' });
    equal(consume(global.__ojobRoutes[port]['/auth'](request('/auth'))), '');
    equal(global.__securitySSEExecuted, false);
  });
  global.__ojobPreRoutes[port] = '';
  check('canonical resolver rejects traversal, sibling prefixes, symlinks and Windows paths', function() {
    ['../private.json', '../public-sibling/file', 'outside/private.json', '..\\private.json', 'C:/private.json', '/private.json', 'bad\u0000name'].forEach(function(path) {
      denied(function() { global.__ojobHttpResolveFile(root, path); });
    });
    equal(global.__ojobHttpResolveFile(root, 'nested/../ok.json'), root + '/ok.json');
    equal(global.__ojobHttpResolveFile(root, 'percent%2e+name.txt'), root + '/percent%2e+name.txt');
    equal(global.__ojobHttpResolveFile('', 'README.md'), io.getCanonicalPath('README.md'));
  });
  check('literal route boundaries preserve metacharacters and root routes', function() {
    equal(global.__ojobHttpRelativePath('/a.b/ok.json', '/a.b'), 'ok.json');
    equal(global.__ojobHttpRelativePath('/ok.json', '/'), 'ok.json');
    denied(function() { global.__ojobHttpRelativePath('/axb/ok.json', '/a.b'); });
    denied(function() { global.__ojobHttpRelativePath('/a.b-extra/ok.json', '/a.b'); });
  });
  check('HTTP File Browse blocks direct traversal and symlink reads', function() {
    var serve = fileHandler();
    ['../private.json', 'outside/private.json'].forEach(function(path) { equal(serve(request('/a.b/' + path)).status, 403); });
    equal(consume(serve(request('/a.b/ok.json', { raw: 'true' }))), '{"ok":true}');
    equal(consume(serve(request('/a.b/percent%2e+name.txt', { raw: 'true' }))), 'literal');
  });
  check('restrictions cover direct/raw/rendered/default files and listing', function() {
    var serve = fileHandler({ restrict: ['hidden\\.json$', 'index\\.md$'], default: 'index.md' });
    [{}, {raw:'true'}, {parse:'false'}].forEach(function(params) { equal(serve(request('/a.b/hidden.json', params)).status, 403); });
    equal(serve(request('/a.b/nested/')).status, 403);
    var listing = consume(serve(request('/a.b/')));
    equal(listing.indexOf('hidden.json') < 0, true);
    equal(listing.indexOf('ok.json') >= 0, true);
    equal(listing.indexOf('outside') < 0, true);
    var csv = fileHandler({ restrict: 'hidden\\.json$,index\\.md$', default:'index.md' });
    equal(csv(request('/a.b/hidden.json')).status, 403);
    var parentDenied = fileHandler({ restrict: ['nested$'] });
    equal(parentDenied(request('/a.b/nested/index.md')).status, 403);
    java.nio.file.Files.createSymbolicLink(new java.io.File(root + '/alias.json').toPath(), new java.io.File(root + '/ok.json').toPath());
    var aliasDenied = fileHandler({ restrict: ['alias\\.json$'] });
    equal(aliasDenied(request('/a.b/alias.json')).status, 403);
    java.nio.file.Files.delete(new java.io.File(root + '/alias.json').toPath());
  });
  check('generic callbacks and API reject query traversal and preserve valid reads', function() {
    var args = { port: port, uri: '/generic', path: root, templates: {}, fns: {}, options: {} };
    run('oJobBrowse.yaml', 'HTTP Browse generic', args);
    var options = global.__GBHTTPD[String(port) + '/generic'];
    ['../private.json', 'outside/private.json'].forEach(function(path) {
      denied(function() { args.fns.getObj(request('/generic/' + path, {raw:'true'}), options); });
      denied(function() { args.fns.getList(request('/generic/' + path), options); });
    });
    var apiArgs = { port: port, uri: '/api', browseUri: '/generic' };
    run('oJobBrowse.yaml', 'HTTP Browse API', apiArgs);
    var api = new Function('request', 'server', 'port', 'uri', job('oJobBrowse.yaml', 'HTTP Browse API').args.execURI);
    equal(api(request('/api', {path:'../private.json', action:'obj', raw:'true'}), server, port, '/api').status, 403);
    equal(consume(api(request('/api', {path:'ok.json', action:'obj', raw:'true'}), server, port, '/api')), '{"ok":true}');
    var custom = function() { return {data:'custom',type:'raw'}; };
    var customArgs = {port:port,uri:'/custom',path:root,templates:{},fns:{getObj:custom},options:{}};
    run('oJobBrowse.yaml', 'HTTP Browse generic', customArgs);
    equal(customArgs.fns.getObj, custom);
  });
  check('browse metadata is escaped and filename links preserve query/hash/plus', function() {
    var filename = 'a\" onmouseover=\"alert(1)\" #?+.txt';
    io.writeFileString(root + '/' + filename, '```\n<script>alert(1)</script>');
    var serve = fileHandler();
    var html = consume(serve(request('/a.b/')));
    equal(html.indexOf('onmouseover="alert(1)"') < 0, true);
    equal(html.indexOf('%23%3F%2B.txt') >= 0, true);
    var options = global.__GBHTTPD[String(port) + '/generic'];
    var missing = options._fns.renderEmpty(request('/generic/<img src=x onerror=alert(1)>'), options);
    equal(missing.indexOf('<img src=x') < 0, true);
    var rendered = options._fns.renderObj({data:'```\n<script>alert(1)</script>',type:'js'}, server, request('/generic/' + filename), options);
    equal(String(rendered.data).indexOf('<script>alert(1)</script>') < 0, true);
  });
  check('upload validates filenames, symlinks and quoted configured roots', function() {
    var path = dir + '/upload\'quoted';
    var args = { path: path, uri: '/upload' }, def = job('oJobHTTPd.yaml', 'HTTP Upload');
    args.eURI = def.args.eURI;
    new Function('args', def.exec)(args);
    var upload = new Function('request', 'server', args.execURI);
    var source = dir + '/temporary-upload'; io.writeFileString(source, 'content');
    ['../overwrite', '..\\overwrite', '/absolute', 'C:relative', '.', '..', 'bad\u0000name'].forEach(function(name) {
      equal(upload({method:'POST', params:{data:name}, files:{data:source}}, server).status, 400);
    });
    java.nio.file.Files.createSymbolicLink(new java.io.File(path + '/link').toPath(), new java.io.File(dir + '/private.json').toPath());
    equal(upload({method:'POST', params:{data:'link'}, files:{data:source}}, server).status, 403);
    equal(upload({method:'POST', params:{data:'café + file.txt'}, files:{data:source}}, server), 'ok');
    equal(io.readFileString(path + '/café + file.txt'), 'content');
    equal(io.readFileString(dir + '/private.json'), '{"secret":true}');
  });
  [false, true].forEach(function(stream) {
    [true, false].forEach(function(mergeVariant) {
    check('MCP protects registration/arguments/hooks stream=' + stream + ' merge=' + mergeVariant, function() {
      var previousMerge = __flags.ALTERNATIVES.merge;
      __flags.ALTERNATIVES.merge = mergeVariant;
      try {
      var handler, calls = [], registry = Object.create({ inherited: 'private-job' });
      registry.echo = 'echo-job';
      var runtime = { loadObj:function(){}, obj:{http:function(){this.exec=function(){return {responseCode:200};};}}, server: { mcp: ow.server.mcp, httpd: {
        route: function(hs, routes) { handler = routes['/mcp']; },
        replyJSONRPC: ow.server.httpd.replyJSONRPC
      } } };
      new Function('args', 'ow', 'global', 'getEnv', '$job', '$err', 'logErr', '$doV', job('oJobMCP.yaml', 'HTTP MCP Server').exec)(
        {port:port,uri:'/mcp',usestream:stream,fns:registry,fnsMeta:{}}, runtime,
        {__ojobHttp:{18091:server},__ojobRoutes:{18091:{}}}, function(name) { return ({OJOB_MCP_POSTHOOK_URL:'http://fixture.invalid',OJOB_MCP_HOOK_INCLUDE_ARGS:'true',OJOB_MCP_HOOK_MAX_BODY:'80'})[name]; },
        function(name, args) { calls.push({name:name,args:args}); return {text:'ok'}; }, function() {}, function() {}, function(fn){fn();}
      );
      function send(name, args) { handler({method:'POST',uri:'/mcp',header:{authorization:'never-forward'},data:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:name,arguments:args}})}); }
      ['inherited','constructor','__proto__','toString'].forEach(function(name) { send(name, {}); });
      equal(calls.length, 0);
      ['__proto__','constructor','prototype'].forEach(function(key) {
        var input = JSON.parse('{"nested":[{"' + key + '":{"polluted":"private-job"}}]}');
        send('echo', input);
      });
      equal(calls.length, 0); equal(Object.prototype.polluted, undefined);
      send('echo', {nested:{values:[1,'café',null]},_httprequest:{header:{authorization:'forged'}}});
      equal(calls.length, 1); equal(calls[0].name, 'echo-job');
      equal(calls[0].args.nested.values[1], 'café'); equal(calls[0].args.nested.values[2], null);
      equal(calls[0].args._httprequest.uri, '/mcp');
      equal(calls[0].args._httprequest.header.authorization, undefined);
      } finally { __flags.ALTERNATIVES.merge = previousMerge; delete Object.prototype.polluted; }
    });
    });
  });
  check('STDIO safely registers special own tool names and rejects prototype arguments', function() {
    var handlers, called = 0, registry = {};
    Object.defineProperty(registry, '__proto__', {value:'echo-job',enumerable:true});
    var runtime = {loadServer:function(){},server:{mcpStdio:function(description, metadata, fs) { handlers = fs; }}};
    new Function('args', 'ow', 'getEnv', '$job', job('oJobMCP.yaml', 'STDIO MCP Server').exec)(
      {fns:registry,fnsMeta:{}}, runtime, function(){}, function(name,args){called++; return {text:'ok'};}
    );
    equal(Object.prototype.hasOwnProperty.call(handlers, '__proto__'), true);
    handlers.__proto__({value:'ordinary'}); equal(called, 1);
    denied(function(){handlers.__proto__(JSON.parse('{"nested":{"__proto__":{"polluted":1}}}'));});
    equal(called, 1); equal(Object.prototype.polluted, undefined);
  });
  check('package manifest traversal is rejected before packing and external source survives', function() {
    var source = dir + '/package-source', output = dir + '/output'; io.mkdir(source);
    io.writeFileString(source + '/file.txt', 'package data');
    var packs = 0;
    var pack = new Function('args', 'oPack', 'sync', job('oJobOPack.yaml', 'oPack Pack external').exec);
    var fakePack = function(command) {
      packs++;
      var manifest = io.readFileYAML(source + '/.package.yaml');
      // Match oPack's genpack step, which replaces the original file inventory.
      manifest.files = io.listFiles(source).files.filter(f=>f.isFile).map(f=>f.filepath.substring(source.length + 1));
      io.writeFileYAML(source + '/.package.yaml', manifest);
      io.writeFileString(manifest.name + '-' + manifest.version + '.opack', 'archive');
    };
    function execute(manifest, extra) {
      io.writeFileYAML(source + '/.package.yaml', manifest);
      pack(merge({filePath:source, outputDir:output, tmpDir:dir+'/unused'},extra || {}), fakePack, function(fn){fn();});
    }
    ['../private.json','/absolute','C:/outside','..\\outside','.'].forEach(function(file) {
      denied(function(){execute({name:'security-fixture',version:'1',files:[file]});});
    });
    equal(packs,0); equal(io.readFileString(dir + '/private.json'),'{"secret":true}');
    java.nio.file.Files.createSymbolicLink(new java.io.File(source + '/unlisted-secret').toPath(), new java.io.File(dir + '/private.json').toPath());
    denied(function(){execute({name:'security-fixture',version:'1',files:['file.txt']});});
    equal(packs,0); io.rm(source + '/unlisted-secret');
    java.nio.file.Files.createSymbolicLink(new java.io.File(source + '/loop').toPath(), new java.io.File(source).toPath());
    denied(function(){execute({name:'security-fixture',version:'1',files:['file.txt']});});
    equal(packs,0); io.rm(source + '/loop');
    execute({name:'security-fixture',version:'1',files:['file.txt']},{withSymLink:true});
    equal(io.readFileString(source + '/file.txt'),'package data');
    equal(io.readFileString(output + '/security-fixture.opack'),'archive');
    execute({name:'security-fixture',version:2},{noVersion:true});
    equal(io.readFileString(output + '/security-fixture.opack'),'archive');
    denied(function(){execute({name:'../escape',version:'1',files:['file.txt']});});
  });
  check('README shell example passes request data without shell interpolation', function() {
    var md = io.readFileString('README.md'), start = md.lastIndexOf('```yaml\n');
    var definition = af.fromYAML(md.substring(start + 8, md.indexOf('\n```', start + 8)));
    var shell = definition.jobs.filter(j => j.name == 'test')[0];
    equal(shell.typeArgs.noTemplate, true);
    ['ordinary café', '$(touch ' + dir + '/shell-marker) `touch ' + dir + '/shell-marker`'].forEach(function(input) {
      global.__securityShellAnswer = undefined;
      ow.loadOJob();
      var id = genUUID(), args = {params:{a:input}};
      ow.oJob.load([shell,{name:'capture-security-answer',exec:'global.__securityShellAnswer = args.ANSWER;'}], ['test','capture-security-answer'], {logToConsole:false}, args, id);
      $set('res', {});
      ow.oJob.start(args, true, id);
      equal(io.fileExists(dir + '/shell-marker'), false);
      equal(global.__securityShellAnswer, 'Echo from the shell (a: ' + input + ')');
    });
    delete global.__securityShellAnswer;
  });
} finally {
  io.rm(root + '/outside');
  if (io.fileExists(dir + '/upload\'quoted/link')) io.rm(dir + '/upload\'quoted/link');
  io.rm(dir);
  delete global.__securitySSEExecuted;
}
print(checks + ' checks, ' + failures + ' failures');
exit(failures ? 1 : 0);
