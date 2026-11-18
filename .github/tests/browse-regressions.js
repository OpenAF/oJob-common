// Runs actual YAML callbacks on local fixtures without opening a listener.
ow.loadServer(); ow.loadTemplate(); ow.loadFormat()
require.cache = require.cache || {}
require.cache['ojob-browse-contract.js'] = new Function('require','exports','module',io.readFileYAML('oJobBrowse.yaml').code['ojob-browse-contract.js'])
var checks = 0
function equal(a, b) { checks++; if (a !== b) throw new Error('Expected ' + b + ', got ' + a) }
function definition(file, name) { return io.readFileYAML(file).jobs.filter(j => j.name == name)[0] }
function run(file, name, args) { new Function('args', definition(file, name).exec)(args) }
var root = String(java.nio.file.Files.createTempDirectory('browse-regression-'))
root = String(new java.io.File(root).getCanonicalPath())
var port = 19843
try {
  io.writeFileString(root + '/a.xml', '<root>café</root>')
  io.writeFileString(root + '/b.json', '{"complete":true}')
  run('oJobHTTPd.yaml', 'HTTP Start Server', {port:port, hs:{}})
  var initialized
  var args = {port:port, uri:'/browse', path:root, templates:{}, options:{query:{enabled:true,pageSize:1},preview:{formats:{xml:'xml'},maxBytes:8}}, fns:{init:function(options){initialized=options}}}
  run('oJobBrowse.yaml', 'HTTP Browse generic', args)
  var options = global.__GBHTTPD[String(port) + '/browse']
  equal(initialized.parentURI, '/browse')
  equal(initialized.port, port)
  equal(initialized.capabilities.query, 1)
  function request(path, params) { return {uri:'/browse/' + path, params:params || {}} }
  var listing = options._fns.getList(request('', {sort:'Filename',order:'desc'}), options)
  equal(listing.list.length, 1)
  equal(listing.list[0].values.Filename, 'b.json')
  equal(listing.pageInfo.total, 2)
  equal(listing.queryInfo.applied, true)
  var search = options._fns.search(request('', {q:'xml'}), options)
  equal(search.list.length, 1)
  equal(search.searchInfo.complete, true)
  equal(search.queryInfo.applied, true)
  options.query.maxScanned=1
  var limited=options._fns.search(request('',{q:'xml'}),options)
  equal(limited.searchInfo.scanned,1)
  equal(limited.searchInfo.complete,false)
  delete options.query.maxScanned
  io.writeFileString(root + '/new.txt', 'new')
  equal(options._fns.search(request('', {q:'new.txt'}), options).list.length, 0)
  options._fns.refresh(Object.assign(request('', {}), {method:'POST'}), options)
  equal(options._fns.search(request('', {q:'new.txt'}), options).list.length, 1)
  var preview = options._fns.getObj(request('a.xml'), options)
  equal(preview.truncated, true)
  equal(preview.type, 'text')
  equal(options._fns.getObj(request('b.json'), options).file, root + '/b.json')
  var api = Object.assign({}, options, {_api:true})
  equal(options._fns.getObj(request('b.json'), api).data.complete, true)
  var raw = options._fns.getObj(request('a.xml', {raw:'true'}), options)
  try { equal(String(af.fromInputStream2String(raw.stream)), '<root>café</root>') } finally { raw.stream.close() }
  var failed = false
  try { options._fns.getList(request('', {size:'-1'}), options) } catch(e) { failed = e.httpStatus == 400 }
  equal(failed, true)
  var defaults = {port:port,uri:'/legacy',path:root,templates:{},options:{},fns:{}}
  run('oJobBrowse.yaml', 'HTTP Browse generic', defaults)
  var legacy = global.__GBHTTPD[String(port) + '/legacy']
  var jsonView = legacy._fns.getObj({uri:'/legacy/b.json',params:{}}, legacy)
  equal(jsonView.jsonViewer,true)
  equal(jsonView.data.includes('{"complete":true}'),false)
  var jsonData = legacy._fns.getObj({uri:'/legacy/b.json',params:{view:'json-data'}}, legacy)
  equal(jsonData.streamType,'application/json; charset=utf-8')
  equal(jsonData.streamHeaders['X-Content-Type-Options'],'nosniff')
  try { equal(String(af.fromInputStream2String(jsonData.stream)), '{"complete":true}') } finally { jsonData.stream.close() }
  var operated={port:port,uri:'/ops',path:root,templates:{},options:{operations:{enabled:true}},fns:{}}
  run('oJobBrowse.yaml','HTTP Browse generic',operated)
  var ops=global.__GBHTTPD[String(port)+'/ops'], req={uri:'/ops/',params:{},method:'POST'}
  ops._fns.getList(req,ops)
  equal(ops._fns.getFreshness(req,ops).loadedAt > 0,true)
  var denied=false
  try {ops._operation('refresh',req,{},false)} catch(e){denied=e.httpStatus==403}
  equal(denied,true)
  req.method='POST';req.params.csrf=ops._refreshToken
  var refreshed=ops._operation('refresh',req,{},false)
  equal(refreshed.status,200)
  equal(ops._fns.refresh(req,ops).refreshed,false)
  equal(ops._operation('metrics',req,{},false).data.indexOf('# EOF')>=0,true)
  var support=require('ojob-browse-contract.js'), calls=0
  var provider=support.provider({query:{enabled:true}}), cache=provider.cache('test').ttl(10000).fn(function(){calls++;return [1]}).create()
  cache.get({x:1});cache.get({x:1})
  equal(calls,1)
  provider.invalidate(function(){return true});cache.get({x:1})
  equal(calls,2)
  var browser={port:port,uri:'/builtin',type:'files',options:{path:root}}
  run('oJobBrowse.yaml','HTTP Browser',browser)
  var rejected=false
  // Simulate a browser type with the legacy contract on every installed runtime.
  var originalFiles = ow.server.httpd.browse.files
  ow.server.httpd.browse.files = () => ({capabilities:{contract:1}})
  try {
    run('oJobBrowse.yaml','HTTP Browser',{port:port,uri:'/unsupported',type:'files',options:{path:root,query:{enabled:true}}})
  } catch(e) { rejected=true }
  finally { ow.server.httpd.browse.files = originalFiles }
  equal(rejected,true)
  var apiDefinition=definition('oJobBrowse.yaml','HTTP Browse API')
  run('oJobBrowse.yaml','HTTP Browse API',{port:port,uri:'/api',browseUri:'/ops',operationsBrowseUris:['/ops']})
  var dispatch=new Function('request','server','port','uri',apiDefinition.args.execURI)
  equal(dispatch({uri:'/api',params:{action:'status',browseUri:'/browse'},method:'GET'}, {},port,'/api').status,403)
  equal(dispatch({uri:'/api',params:{action:'status'},method:'GET'}, {},port,'/api').status,200)
  equal(dispatch({uri:'/api',params:{action:'refresh'},method:'GET'}, {},port,'/api').status,405)
  var apiRefresh = {uri:'/api',params:{action:'refresh',csrf:ops._refreshToken},method:'POST',header:{}}
  equal(dispatch(apiRefresh, {},port,'/api').status,403)
  run('oJobBrowse.yaml','HTTP Browse API',{port:port,uri:'/api',browseUri:'/ops',operationsBrowseUris:['/ops'],operationsToken:'fixture-token'})
  apiRefresh.header['x-openaf-browse-token'] = 'wrong'
  equal(dispatch(apiRefresh, {},port,'/api').status,403)
  apiRefresh.header['x-openaf-browse-token'] = 'fixture-token'
  equal(dispatch(apiRefresh, {},port,'/api').status,200)
  var limit = 4 * 1024 * 1024
  io.writeFileString(root + '/large.json', 'x'.repeat(limit + 1))
  var large = legacy._fns.getObj({uri:'/legacy/large.json',params:{view:'source'}}, legacy)
  equal(large.truncated,true)
  equal(large.type,'text')
  var largeJSON = legacy._fns.getObj({uri:'/legacy/large.json',params:{view:'json-data'}}, legacy)
  try {
    equal(Number(largeJSON.stream.transferTo(java.io.OutputStream.nullOutputStream())),limit + 1)
  } finally { largeJSON.stream.close() }
  var oldCalls=0
  global.__GBHTTPD[String(port)+'/old']={_fns:{search:function(){oldCalls++;return {list:[]}}}}
  equal(dispatch({uri:'/api',params:{action:'search',browseUri:'/old'},method:'GET'}, {},port,'/api').status,200)
  equal(oldCalls,1)
  var concurrent=$atomic(0), pc=support.provider({query:{enabled:true}})
  var cc=pc.cache('parallel').ttl(10000).fn(function(){concurrent.inc();sleep(30,true);return [42]}).create()
  var results=parallel4Array([1,2,3,4,5,6,7,8],function(){return cc.get({same:true})[0]})
  equal(concurrent.get(),1)
  equal(results.length,8)
  equal(support.matchesUnit('domain/repo/a',{domain:'domain',repository:'other'},''),false)
  equal(support.matchesUnit('domain/repo/a',{domain:'domain',repository:'repo'},''),true)
  print('PASS ' + checks + ' browse regression assertions')
} finally { io.rm(root) }
