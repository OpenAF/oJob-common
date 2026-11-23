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
  io.writeFileString(root + '/c.txt', 'created after startup')
  var wildcardRequest = request('', {q:'?.XML'})
  equal(options._fns.search(wildcardRequest, options).list.length, 0)
  options.query.wildcards = true
  equal(options._fns.search(wildcardRequest, options).list[0].values.Filename, 'a.xml')
  equal(options._fns.search(request('', {q:'*.json'}), options).list[0].values.Filename, 'b.json')
  delete options.query.wildcards
  var listing = options._fns.getList(request('', {sort:'Filename',order:'desc'}), options)
  equal(listing.list.length, 1)
  equal(listing.list[0].values.Filename, 'b.json')
  equal(listing.pageInfo.total, 2)
  equal(listing.queryInfo.applied, true)
  var req = request('', {q:'a&b',size:'1',page:'2',sort:'Filename',order:'desc'})
  var html = String(options._fns.renderList(listing, {}, req, options))
  equal(html.indexOf('<table id="browse-listing" data-browse-server-sort style="display:table;width:100%">'), -1)
  var iconColumnRule = '#browse-listing > thead > tr > th:first-child,#browse-listing > tbody > tr > td:first-child'
  equal(html.includes(iconColumnRule), false)
  options.fullWidth = true
  var fullWidthHTML = String(options._fns.renderList(listing, {}, req, options))
  equal(fullWidthHTML.includes('<table id="browse-listing" data-browse-server-sort style="display:table;width:100%">'), true)
  equal(fullWidthHTML.includes(iconColumnRule), true)
  equal(fullWidthHTML.includes('width:2.5rem;min-width:2.5rem;max-width:2.5rem'), true)
  delete options.fullWidth
  var refresh = request('', {})
  refresh.method = 'POST'
  options._fns.refresh(refresh, options)
  equal(options._fns.getList(request('', {}), options).pageInfo.total, 3)
  equal(html.indexOf('sort-button active') >= 0, true)
  equal(html.indexOf('&#9660;') >= 0 || html.indexOf('▼') >= 0, true)
  equal(html.indexOf('q=a%26b&amp;size=1&amp;sort=Filename&amp;order=asc&amp;page=1') >= 0, true)
  equal(html.indexOf('href="?q=a%26b&amp;size=1&amp;page=1"') >= 0, true)
  var pager = html.match(/<div class="browse-pager"[^>]*>(.*?)<\/div>/)[1]
  equal((pager.match(/<svg class="browse-arrow"/g) || []).length, 2)
  equal(/aria-label="Next page"><svg class="browse-arrow"/.test(pager), true)
  equal(/aria-label="Previous page"/.test(pager), false)
  equal(/href="b\.json\?raw=true" download="b\.json" aria-label="Download"><svg class="browse-arrow"[^>]*stroke="currentColor"/.test(html), true)
  equal(html.indexOf('<select name="sort">') < 0, true)
  equal(html.indexOf('name="sort" value="Filename"') >= 0, true)
  equal(html.indexOf('/js/mdtablesort.js') < 0, true)
  // Sort markup must never enter Showdown's generated table header IDs.
  equal((html.match(/<tbody>[\s\S]*?<\/tbody>/)[0].match(/<tr>/g) || []).length, listing.list.length)
  var header = html.match(/<thead>[\s\S]*?<\/thead>/)[0]
  equal((header.match(/<th\b/g) || []).length, listing.fields.length + 1)
  equal((header.match(/class="sorter-container"/g) || []).length, listing.fields.length)
  equal(/<th id="filename"[^>]*>Filename<span class="sorter-container"/.test(header), true)
  equal(header.indexOf('id="filename<span'), -1)
  equal(header.indexOf('_aria-label='), -1)
  equal((html.match(/class="browse-controls" method="get"/g) || []).length, 1)
  equal(html.indexOf('<label for="browse-search-input">Search</label>') >= 0, true)
  equal(html.indexOf('name="csrf"') >= 0, true)
  equal(html.indexOf('action="/browse/@@/refresh"') >= 0, true)
  equal(html.indexOf('data-url="/browse/@@/status?path="') >= 0, true)
  equal(html.indexOf('popover="auto"') >= 0, true)
  equal(html.indexOf('window.innerWidth - width - 8') >= 0, true)
  equal(html.indexOf('id="browse-options" class="browse-options" popover="auto"') >= 0, true)
  equal((html.match(/class="browse-apply"/g) || []).length, 1)
  equal(html.indexOf('aria-haspopup="dialog"') >= 0, true)
  equal(html.indexOf('nJSMap(safeMap(statusData), undefined, dark)') >= 0, true)
  equal(html.indexOf('/js/njsmap.js') >= 0, true)
  equal(header.indexOf('id="browse-options-toggle"') >= 0, true)
  equal(header.indexOf('popovertarget="browse-options"') >= 0, true)
  equal((header.match(/class="browse-icon/g) || []).length, 1)
  equal(header.indexOf('browse-filtered') >= 0, true)
  equal(header.indexOf('aria-expanded="false"') >= 0, true)
  equal(html.indexOf('<dialog id="browse-status"') >= 0, true)
  equal(html.indexOf('Unable to refresh (HTTP ') >= 0, true)
  var popover = html.substring(html.indexOf('<div id="browse-options"'), html.indexOf('<table id="browse-listing"'))
  equal(popover.indexOf('id="browse-refresh"') >= 0, true)
  equal(popover.indexOf('id="browse-status-toggle"') >= 0, true)
  equal(html.indexOf('optionsPanel.hidePopover()') >= 0, true)
  equal(html.indexOf('id="browse-pagination"') >= 0, true)
  equal(html.indexOf('id="browse-listing"') >= 0, true)
  equal(html.indexOf('Press Apply to search') >= 0, true)
  equal(html.indexOf("searchInput.addEventListener('input', queueSearch)") >= 0, true)
  equal(html.indexOf("searchForm.addEventListener('submit', cancelLiveSearch)") >= 0, true)
  equal(popover.indexOf('id="browse-clear-search"') >= 0, true)
  equal(popover.indexOf('aria-label="Clear search"') >= 0, true)
  equal(/id="browse-clear-search"[^>]*><svg/.test(popover), true)
  var searchFormHTML = popover.match(/<form id="browse-search-form" class="browse-controls"[\s\S]*?<\/form>/)[0]
  equal((searchFormHTML.match(/type="submit"/g) || []).length, 1)
  equal(searchFormHTML.indexOf('class="browse-apply" type="submit"') >= 0, true)
  equal(searchFormHTML.indexOf('id="browse-clear-search" class="browse-icon" type="button"') >= 0, true)
  var originalFreshness = options._fns.getFreshness
  try {
    var updatedAt = now() - 125000
    options._fns.getFreshness = () => ({loadedAt:updatedAt - 120000, lastUpdatedAt:updatedAt})
    var pending = Object.assign({}, listing, {searchInfo:{complete:false, refreshing:true}})
    var partial = Object.assign({}, listing, {searchInfo:{complete:false, coverage:'loaded package hierarchies'}})
    var rendered = String(options._fns.renderList(pending, {}, req, options))
    equal(rendered.includes('Cache updated <time datetime="' + new Date(updatedAt).toISOString() + '">2 minutes ago</time>'), true)
    equal(rendered.includes('data-pending="true"><span role="status">Loading more cached data'), true)
    rendered = String(options._fns.renderList(partial, {}, req, options))
    equal(rendered.includes('data-pending="false"><span role="status">Searched loaded package trees.'), true)
    equal(String(options._fns.renderList(pending, {}, request('', {}), options)).includes('data-pending="false"><span role="status"></span></div>'), true)
    var fragmentRequest = Object.assign({}, req, {method:"GET",header:{"x-openaf-browse-fragment":"1"}})
    var fragment = options._fns.renderList(pending, {}, fragmentRequest, options)
    equal(fragment.status, 200)
    equal(fragment.data.includes('id="browse-listing" data-browse-server-sort'), true)
    equal(fragment.data.includes('id="browse-search-form"'), false)
    equal(fragment.data.includes('<html'), false)
    equal(fragment.data.includes('id="browse-cache-age"'), true)
    options._fns.getFreshness = () => { throw new Error('Freshness unavailable') }
    rendered = String(options._fns.renderList(listing, {}, req, options))
    equal(rendered.includes('id="browse-cache-age" class="browse-cache-age"></div>'), true)
  } finally { options._fns.getFreshness = originalFreshness }
  var previousTheme = __flags.MD_DARKMODE
  try {
    ;['false', 'true'].forEach(theme => {
      __flags.MD_DARKMODE = theme
      var themed = String(options._fns.renderList(listing, {}, request('', {}), options))
      equal(themed.indexOf('id="browse-options" class="browse-options" popover="auto"') >= 0, true)
      equal(themed.indexOf('class="browse-icon browse-filtered"'), -1)
      equal(themed.indexOf('--browse-fg:#919ba6') >= 0, true)
      equal(themed.indexOf('--browse-fg:#747d86') >= 0, true)
      equal(themed.indexOf('stroke="currentColor"') >= 0, true)
      equal(themed.indexOf('id="filename<span'), -1)
    })
  } finally { __flags.MD_DARKMODE = previousTheme }
  options.query.enabled = false
  options.sortTab = true
  var legacy = String(options._fns.renderList({fields:listing.fields,alignFields:listing.alignFields,key:listing.key,list:listing.list}, {}, request('',{}), options))
  equal(legacy.indexOf('/js/mdtablesort.js') >= 0, true)
  equal(legacy.includes('data-browse-server-sort'), false)
  equal(legacy.indexOf('class="sorter-container"') < 0, true)
  equal(legacy.indexOf('id="browse-options-toggle"') >= 0, true)
  equal(legacy.indexOf('<form id="browse-search-form" class="browse-controls"'), -1)
  var sortedLegacy = String(options._fns.renderList({
    fields: ['Version'], alignFields: ['left'], key: 'Version',
    sortInfo: {field:'Version',order:'desc'},
    list: [{values:{Version:'2.0.0'}}, {values:{Version:'1.10.0'}}]
  }, {}, request('',{sort:'Version', order:'desc'}), options))
  var legacyRows = sortedLegacy.match(/<tbody>[\s\S]*?<\/tbody>/)[0]
  equal(legacyRows.indexOf('2.0.0') < legacyRows.indexOf('1.10.0'), true)
  equal(sortedLegacy.includes('href="?sort=Version&amp;order=desc&amp;page=1"'), true)
  equal(sortedLegacy.includes('/js/mdtablesort.js'), false)
  print('PASS ' + checks + ' browse sorting assertions')
} finally {io.rm(root)}
