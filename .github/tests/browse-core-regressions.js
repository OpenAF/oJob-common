// Supply a staged or checkout browser module as the first script argument via CORE_BROWSE_MODULE.
ow.loadServer();ow.loadTemplate();ow.loadFormat()
if(getEnv('CORE_BROWSE_MODULE')!='jar')load(getEnv('CORE_BROWSE_MODULE') || '../openaf/js/owrap.server.browse.js')
var checks=0
function equal(a,b){checks++;if(a!==b)throw new Error('Expected '+b+', got '+a)}
var root=String(new java.io.File(String(java.nio.file.Files.createTempDirectory('browse-core-'))).getCanonicalPath())
try {
  io.mkdir(root+'/public')
  io.writeFileString(root+'/secret.txt','secret')
  io.writeFileString(root+'/public/a.xml','<a>café</a>')
  io.writeFileString(root+'/public/b.json','{"ok":true}')
  var options=ow.server.httpd.browse.files('/test.dir',{path:root+'/public',query:{enabled:true,pageSize:1},preview:{formats:{xml:'xml'},maxBytes:5},operations:{enabled:true}})
  var req={uri:'/test.dir/',params:{order:'desc'},method:'GET'}
  var result=options._fns.getList(req,options)
  equal(result.pageInfo.total,2);equal(result.list[0].values.Filename,'b.json')
  var html=options._fns.renderList(result,{},{uri:'/test.dir/',params:{}},options)
  equal(String(html).indexOf('b.json')>=0,true)
  var obj=options._fns.getObj({uri:'/test.dir/a.xml',params:{}},options)
  equal(obj.truncated,true)
  var denied=false
  try{options._fns.getObj({uri:'/test.dir/../secret.txt',params:{raw:'true'}},options)}catch(e){denied=e.httpStatus==403}
  equal(denied,true)
  var stream=options._fns.getObj({uri:'/test.dir/a.xml',params:{raw:'true'}},options).stream
  try{equal(String(af.fromInputStream2String(stream)),'<a>café</a>')}finally{stream.close()}
  equal(options.capabilities.operations,1)
  var sized=ow.server.httpd.browse.support.query({isList:true,key:'Filename',fields:['Filename','Size'],list:[{values:{Filename:'large',Size:'1 KB','Size in bytes':1024}},{values:{Filename:'small',Size:'900 B','Size in bytes':900}}]}, {params:{sort:'Size'}},{query:{enabled:true}})
  equal(sized.list[0].values.Filename,'small')
  var legacy=ow.server.httpd.browse.files('/legacy',{path:root+'/public'})
  equal(legacy._fns.getObj({uri:'/legacy/b.json',params:{}},legacy).data.ok,true)
  print('PASS '+checks+' core browse assertions')
} finally {io.rm(root)}
