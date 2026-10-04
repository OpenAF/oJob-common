// Run from the repository root: oaf -f .github/tests/mcp-notifications.js
ow.loadServer();
var source = io.readFileYAML('oJobMCP.yaml').jobs.filter(j => j.name == 'HTTP MCP Server')[0].exec;
var checks = 0, failures = 0;
function check(name, fn) {
  checks++;
  try { fn(); print('PASS ' + name); }
  catch (e) { failures++; printErr('FAIL ' + name + ': ' + e); }
}
function equal(actual, expected) {
  if (actual !== expected) throw 'Expected ' + stringify(expected) + ', got ' + stringify(actual);
}
function endpoint(stream, modern, token, olderDispatcher) {
  var handler, dispatches = 0;
  var runtime = { server: { mcp: ow.server.mcp, httpd: {
    route: function(server, routes) { handler = routes['/mcp']; },
    replyJSONRPC: function() {
      dispatches++;
      // Reproduce the older runtime's method lookup before notification handling.
      if (olderDispatcher) {
        var req = arguments[1], methods = arguments[2];
        var message = jsonParse(req.files ? req.files.postData : req.data);
        if (!isFunction(methods[message.method])) return {
          status: 404, data: stringify({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' } })
        };
      }
      return ow.server.httpd.replyJSONRPC.apply(ow.server.httpd, arguments);
    }
  } } };
  new Function('args', 'ow', 'global', 'getEnv', 'log', source)(
    { port: 12345, uri: '/mcp', usestream: stream, modern: modern, authtoken: token, fns: {}, fnsMeta: {} },
    runtime, { __ojobHttp: { 12345: {} }, __ojobRoutes: { 12345: {} } }, function() {}, function() {}
  );
  return { send: handler, count: function() { return dispatches; } };
}
function request(value, files) {
  var req = { method: 'POST', uri: '/mcp', header: {} };
  if (files) req.files = { postData: stringify(value) };
  else req.data = stringify(value);
  return req;
}
[false, true].forEach(function(stream) {
  ['notifications/roots/list_changed', 'notifications/initialized', 'notifications/cancelled'].forEach(function(method) {
    [false, true].forEach(function(files) {
      check('modern notification ' + method + ' stream=' + stream + ' files=' + files, function() {
        var ep = endpoint(stream, true), result = ep.send(request({ jsonrpc: '2.0', method: method }, files));
        equal(result.status, 202);
        equal(result.data, '');
        equal(ep.count(), 0); // Works even with older OpenAF dispatchers that reject unknown methods.
      });
    });
  });
  check('authentication precedes notification acceptance stream=' + stream, function() {
    var ep = endpoint(stream, true, 'test-token');
    var req = request({ jsonrpc: '2.0', method: 'notifications/roots/list_changed', params: {} });
    equal(ep.send(req).status, 401);
    equal(ep.count(), 0);
    req.header.authorization = 'Bearer test-token';
    equal(ep.send(req).status, 202);
    equal(ep.count(), 0);
  });
});
check('older dispatcher reproduction and modern compatibility', function() {
  var req = request({ jsonrpc: '2.0', method: 'notifications/roots/list_changed' });
  var baseline = endpoint(false, false, __, true).send(req);
  equal(baseline.status, 404);
  equal(jsonParse(baseline.data).error.code, -32601);
  [false, true].forEach(function(stream) {
    var result = endpoint(stream, true, __, true).send(req);
    equal(result.status, 202);
    equal(result.data, '');
  });
});
check('initialize, ping and tools/list remain usable after a roots notification', function() {
  var ep = endpoint(false, true);
  equal(ep.send(request({ jsonrpc: '2.0', method: 'notifications/roots/list_changed' })).status, 202);
  ['initialize', 'ping', 'tools/list'].forEach(function(method) {
    var response = ep.send(request({ jsonrpc: '2.0', id: 7, method: method, params: {} }));
    equal(response.status, 200);
    var body = isString(response.data) ? jsonParse(response.data) : response.data;
    equal(body.id, 7);
    equal(isDef(body.result), true);
    equal(isDef(body.error), false);
  });
});
check('legacy endpoint still uses the runtime dispatcher', function() {
  var ep = endpoint(false, false);
  ep.send(request({ jsonrpc: '2.0', method: 'notifications/roots/list_changed' }));
  equal(ep.count(), 1);
});
check('request IDs, invalid envelopes and other methods still reach the dispatcher', function() {
  var ep = endpoint(false, true);
  [
    { jsonrpc: '2.0', method: 'notifications/roots/list_changed', id: 0 },
    { jsonrpc: '2.0', method: 'notifications/roots/list_changed', id: null },
    { jsonrpc: '1.0', method: 'notifications/roots/list_changed' },
    { jsonrpc: '2.0', method: 'notifications/roots/list_changed', params: 'invalid' },
    { jsonrpc: '2.0', method: 'ping', id: 1 },
    { jsonrpc: '2.0', method: 'tools/list', id: 2 }
  ].forEach(function(value) { ep.send(request(value)); });
  var req = request({ jsonrpc: '2.0', method: 'notifications/roots/list_changed' });
  req.method = 'GET';
  ep.send(req);
  ep.send({ method: 'POST', data: '{', header: {} });
  equal(ep.count(), 8);
});
print(checks + ' checks, ' + failures + ' failures');
exit(failures ? 1 : 0);
