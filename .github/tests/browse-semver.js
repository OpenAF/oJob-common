// Run with oaf -f .github/tests/browse-semver.js; set CORE_BROWSE_MODULE for the sibling renderer.
ow.loadServer(); ow.loadTemplate(); ow.loadFormat()
require.cache = require.cache || {}
var yaml = io.readFileYAML('oJobBrowse.yaml')
require.cache['ojob-browse-contract.js'] = new Function('require', 'exports', 'module', yaml.code['ojob-browse-contract.js'])
var support = require('ojob-browse-contract.js')
if (getEnv('CORE_BROWSE_MODULE')) {
  load(getEnv('CORE_BROWSE_MODULE'))
  support = ow.server.httpd.browse.support
}
var checks = 0
function equal(a, b) { checks++; if (JSON.stringify(a) != JSON.stringify(b)) throw new Error('Expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)) }
var root = String(java.nio.file.Files.createTempDirectory('browse-semver-'))
var fixture
function listing(values) { return {isList:true,fields:['Version'],alignFields:['left'],key:'Version',list:values.map(v => ({values:{Version:v}}))} }
try {
  var sorters = [function(values, params) { return support.query(listing(values), {params:params}, {query:{enabled:true,pageSize:100}}) }]
  if (!getEnv('CORE_BROWSE_MODULE')) {
    var start = io.readFileYAML('oJobHTTPd.yaml').jobs.filter(j => j.name == 'HTTP Start Server')[0]
    new Function('args', start.exec)({port:19847, hs:{}})
    var job = yaml.jobs.filter(j => j.name == 'HTTP Browse generic')[0]
    new Function('args', job.exec)({port:19847,uri:'/versions',path:root,templates:{},options:{query:{enabled:true,pageSize:100}},fns:{getList:function(){return clone(fixture)}}})
    var options = global.__GBHTTPD['19847/versions']
    sorters.push(function(values, params) { fixture=listing(values);return options._fns.getList({uri:'/versions/',params:params},options) })
  }
  var chain = ['1.0.0-alpha','1.0.0-alpha.1','1.0.0-alpha.beta','1.0.0-beta','1.0.0-beta.2','1.0.0-beta.11','1.0.0-rc.1','1.0.0','1.2.0','1.10.0','2.0.0']
  sorters.forEach(function(sort) {
    function values(result) {return result.list.map(row => row.values.Version)}
    var folders = ['2.4','2.4.2','1.2','2.4.1','docs','2.10','2.8']
    equal(values(sort(folders, {order:'desc'})), ['docs','2.10','2.8','2.4.2','2.4.1','2.4','1.2'])
    equal(values(sort(chain.slice().reverse(), {})), chain)
    equal(values(sort(chain, {order:'desc'})), chain.slice().reverse())
    equal(values(sort(chain.slice().reverse(), {size:3,page:2})), chain.slice(3,6))
    equal(values(sort(['1.0.0+z','1.0.0+a','1.0.0'],{})), ['1.0.0+z','1.0.0+a','1.0.0'])
    equal(values(sort(['9007199254740993.0.0','9007199254740992.0.0'],{})), ['9007199254740992.0.0','9007199254740993.0.0'])
    equal(values(sort(['1.0.0-9007199254740993','1.0.0-9007199254740992'],{})), ['1.0.0-9007199254740992','1.0.0-9007199254740993'])
    equal(values(sort(['1.0.0-a','1.0.0-A','1.0.0-1'],{})), ['1.0.0-1','1.0.0-A','1.0.0-a'])
    equal(values(sort(['v1.10.0','v1.2.0'],{})), ['v1.2.0','v1.10.0'])
    equal(values(sort(['latest','1.10.0','1.2.0'],{})), ['1.2.0','1.10.0','latest'])
    equal(values(sort(['b','a'],{})), ['a','b'])
    equal(values(sort([10,2],{})), [2,10])
  })
  equal(support.compareValues('1.0.0-01','1.0.0-1') > 0,true)
  equal(support.compareValues('1.0.0+001','1.0.0+002'),0)
  var directories = listing(['2.0.0','1.0.0'])
  directories.list[1].isDirectory=true
  equal(support.query(directories,{params:{order:'desc'}},{query:{enabled:true}}).list[0].values.Version,'1.0.0')
  print('PASS ' + checks + ' server SemVer assertions')
} finally {io.rm(root)}
