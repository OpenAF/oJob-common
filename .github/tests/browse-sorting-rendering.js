// Run from the repository root: oaf -f .github/tests/browse-sorting-rendering.js
// Set CORE_BROWSE_MODULE=../openaf/js/owrap.server.browse.js to check the sibling core renderer.
// Render the actual browse callback without opening a listener.
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
  var options
  if (getEnv('CORE_BROWSE_MODULE')) {
    load(getEnv('CORE_BROWSE_MODULE'))
    options = ow.server.httpd.browse.files('/browse', {path:root,query:{enabled:true,pageSize:1},operations:{enabled:true}})
  } else {
    run('oJobHTTPd.yaml', 'HTTP Start Server', {port:port, hs:{}})
    var initialized
    var args = {port:port, uri:'/browse', path:root, templates:{}, options:{query:{enabled:true,pageSize:1},operations:{enabled:true},preview:{formats:{xml:'xml'},maxBytes:8}}, fns:{init:function(options){initialized=options}}}
    run('oJobBrowse.yaml', 'HTTP Browse generic', args)
    options = global.__GBHTTPD[String(port) + '/browse']
    equal(initialized.parentURI, '/browse')
    equal(initialized.port, port)
    equal(initialized.capabilities.query, 1)
  }
  function request(path, params) { return {uri:'/browse/' + path, params:params || {}} }
  var listing = options._fns.getList(request('', {sort:'Filename',order:'desc'}), options)
  equal(listing.list.length, 1)
  equal(listing.list[0].values.Filename, 'b.json')
  equal(listing.pageInfo.total, 2)
  equal(listing.queryInfo.applied, true)
  var req = request('', {q:'a&b',size:'1',page:'2',sort:'Filename',order:'desc'})
  var html = String(options._fns.renderList(listing, {}, req, options))
  equal(html.indexOf('sort-button active') >= 0, true)
  equal(html.indexOf('&#9660;') >= 0 || html.indexOf('▼') >= 0, true)
  equal(html.indexOf('q=a%26b&amp;size=1&amp;sort=Filename&amp;order=asc&amp;page=1') >= 0, true)
  equal(html.indexOf('href="?q=a%26b&amp;size=1&amp;page=1"') >= 0, true)
  equal(html.indexOf('<select name="sort">') < 0, true)
  equal(html.indexOf('name="sort" value="Filename"') >= 0, true)
  equal(html.indexOf('/js/mdtablesort.js') < 0, true)
  // Sort markup must never enter Showdown's generated table header IDs.
  var header = html.match(/<thead>[\s\S]*?<\/thead>/)[0]
  equal((header.match(/<th\b/g) || []).length, listing.fields.length + 1)
  equal((header.match(/class="sorter-container"/g) || []).length, listing.fields.length)
  equal(/<th id="filename"[^>]*>Filename<span class="sorter-container"/.test(header), true)
  equal(header.indexOf('id="filename<span'), -1)
  equal(header.indexOf('_aria-label='), -1)
  equal((html.match(/<form class="browse-controls"/g) || []).length, 2)
  equal(html.indexOf('<label class="browse-search">Search') >= 0, true)
  equal(html.indexOf('name="csrf"') >= 0, true)
  equal(html.indexOf('action="/browse/@@/refresh"') >= 0, true)
  equal(html.indexOf('href="/browse/@@/status"') >= 0, true)
  equal(html.indexOf('flex-wrap:wrap') >= 0, true)
  equal(html.indexOf('max-width:480px') >= 0, true)
  options.query.enabled = false
  options.sortTab = true
  var legacy = String(options._fns.renderList({fields:listing.fields,alignFields:listing.alignFields,key:listing.key,list:listing.list}, {}, request('',{}), options))
  equal(legacy.indexOf('/js/mdtablesort.js') >= 0, true)
  equal(legacy.indexOf('class="sorter-container"') < 0, true)
  print('PASS ' + checks + ' browse sorting assertions')
} finally {io.rm(root)}
