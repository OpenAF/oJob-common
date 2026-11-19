// Run from any cwd with BROWSE_SOURCE set to the oJob-common checkout.
var source=getEnv('BROWSE_SOURCE')
if(!source)throw new Error('Set BROWSE_SOURCE to the checkout')
var temp=String(java.nio.file.Files.createTempDirectory('browse-package-'))
try {
  var manifest=io.readFileYAML(source+'/.package.yaml')
  manifest.files.forEach(function(file){var target=temp+'/'+file,parent=String(new java.io.File(target).getParent());if(!io.fileExists(parent))io.mkdir(parent);io.cp(source+'/'+file,target)})
  ow.loadOJob();ow.oJob.loadFile(temp+'/oJobBrowse.yaml',{},__,__,__,true)
  var contract=require('ojob-browse-contract.js')
  if(contract.capabilities.contract!==1)throw new Error('Wrong contract resolved')
  var http=io.readFileYAML(temp+'/oJobHTTPd.yaml'),browse=io.readFileYAML(temp+'/oJobBrowse.yaml')
  new Function('args',http.jobs.filter(j=>j.name=='HTTP Start Server')[0].exec)({port:19845,hs:{}})
  io.mkdir(temp+'/fixtures');io.writeFileString(temp+'/fixtures/sample.xml','<test>complete</test>')
  var args={port:19845,uri:'/package',path:temp+'/fixtures',templates:{},fns:{},options:{query:{enabled:true},preview:{formats:{xml:'xml'},maxBytes:5}}}
  new Function('args',browse.jobs.filter(j=>j.name=='HTTP Browse generic')[0].exec)(args)
  var options=global.__GBHTTPD['19845/package']
  if(!options._fns.getObj({uri:'/package/sample.xml',params:{}},options).truncated)throw new Error('Packaged preview did not run')
  args.uri='/package-old';args.fns={};args.options={old:true,preview:{maxBytes:1}}
  new Function('args',browse.jobs.filter(j=>j.name=='HTTP Browse generic')[0].exec)(args)
  var old=global.__GBHTTPD['19845/package-old']
  if(!old._fns.getObj({uri:'/package-old/sample.xml',params:{}},old).file)throw new Error('Packaged legacy browser did not run')
  print('PASS manifest-copy loading and preview from unrelated cwd')
} finally {io.rm(temp)}
