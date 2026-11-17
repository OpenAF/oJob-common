ow.loadServer();ow.loadTemplate();ow.loadFormat();ow.loadCh()
new Function('args',io.readFileYAML('oJobHTTPd.yaml').jobs.filter(j=>j.name=='HTTP Start Server')[0].exec)({port:19844,hs:{}})
var checks=0, clients=0, detailCalls=0, scans=0
function equal(a,b){checks++;if(a!==b)throw new Error('Expected '+b+', got '+a)}
var yaml=io.readFileYAML('oJobBrowse.yaml'), support={}
new Function('exports',yaml.code['ojob-browse-contract.js'])(support)
function FakeAWS(){clients++}
FakeAWS.prototype.ECR_DescribeRepositories=function(){return ['a','b','c'].map(n=>({repositoryName:n}))}
FakeAWS.prototype.ECR_DescribeImages=function(){detailCalls++;return [{imagePushedAt:1,imageTags:['latest']}]}
FakeAWS.prototype.CODEARTIFACT_ListDomains=function(){return [{domainName:'d'}]}
FakeAWS.prototype.CODEARTIFACT_ListRepositories=function(){return [{repositoryName:'r',domainName:'d'}]}
FakeAWS.prototype.CODEARTIFACT_ListPackages=function(){return [{format:'generic',package:'z'},{format:'generic',package:'a'}]}
FakeAWS.prototype.CODEARTIFACT_ListPackageVersions=function(){return [{version:'2',publishedTime:2},{version:'1',publishedTime:1}]}
FakeAWS.prototype.CODEARTIFACT_ListPackageVersionAssets=function(){return [{name:'asset.xml',size:20}]}
function FakeS3(){clients++}
FakeS3.prototype.listObjects=function(){return [{filename:'a.xml',isFile:true,size:20,lastModified:1}]}
FakeS3.prototype.walkObjects=function(bucket,prefix,callback){scans++;callback({filename:prefix+'a.xml',isFile:true,size:20,lastModified:1});return {complete:true,totalExact:true,scanned:1}}
FakeS3.prototype.getObjectStream=function(bucket,key,offset,len){return af.fromString2InputStream('<root>complete</root>'.substring(0,len||100))}
function run(file,name,args,missing){var job=io.readFileYAML(file).jobs.filter(j=>j.name==name)[0];new Function('args','loadLib','load','AWS','S3','require',job.exec)(args,function(){},function(){},FakeAWS,FakeS3,function(){if(missing)throw Error('missing');return support});return args}
function options(args){var o=Object.assign({},args.options,{parentURI:args.uri,parentPath:args.path||'',port:1});args.fns.init(o);return o}
var ecr='../openaf-opacks/AWS/oJobECR.yaml', s3='../openaf-opacks/S3/oJobS3.yaml'
var failed=false
try{run(ecr,'HTTP Browse - ecr',{options:{query:{enabled:true}}},true)}catch(e){failed=true}
equal(failed,true);equal(clients,0)
var args=run(ecr,'HTTP Browse - ecr',{port:1,uri:'/ecr',path:'',options:{query:{enabled:true,pageSize:1}}})
var opts=options(args), result=args.fns.getList({uri:'/ecr/',params:{}},opts)
equal(result.list.length,1);equal(result.pageInfo.total,3);equal(detailCalls,1)
args.fns.getList({uri:'/ecr/',params:{}},opts);equal(detailCalls,1)
var beforeAPI=clients, api=run(ecr,'HTTP Browse - ecr - API',{options:{query:{enabled:true}}})
equal(clients,beforeAPI)
var sa=run(s3,'HTTP Browse - s3',{url:'http://example.invalid',bucket:'b',port:2,uri:'/s3',path:'',cache:10000,options:{query:{enabled:true},preview:{formats:{xml:'xml'},maxBytes:5}}})
var so=options(sa)
var req={uri:'/s3/',params:{q:'xml'}}
equal(sa.fns.search(req,so).list.length,1);sa.fns.search(req,so);equal(scans,1)
equal(sa.fns.getObj({uri:'/s3/a.xml',params:{}},so).truncated,true)
var raw=sa.fns.getObj({uri:'/s3/a.xml',params:{raw:'true'}},so)
try{equal(String(af.fromInputStream2String(raw.stream)),'<root>complete</root>')}finally{raw.stream.close()}
var ca=run('../openaf-opacks/AWS/oJobCodeArtifact.yaml','HTTP Browse - codeartifact',{port:3,uri:'/ca',path:'',options:{query:{enabled:true,pageSize:1}}})
var co=options(ca), cr={uri:'/ca/d/r/generic/',params:{sort:'Package',order:'desc'}}
var candidates=ca.fns.getList(cr,co), paged=support.query(candidates,cr,co)
equal(candidates.list.length,2);equal(paged.list.length,1);equal(paged.list[0].values.Package,'z')
var search=ca.fns.search({uri:'/ca/d/r/',params:{q:'generic'}},co)
equal(search.list.length,2);equal(search.searchInfo.complete,false)
equal(ca.fns.getFreshness({uri:'/ca/d/r/',params:{}},co).loadedAt>0,true)
equal(args.fns.search({uri:'/ecr/',params:{q:'a'}},opts).list.length,1)
var legacy=run(ecr,'HTTP Browse - ecr',{port:4,uri:'/legacy',options:{}},true)
equal(isFunction(legacy.fns.getList),true)
legacy.templates={};legacy.path=''
var installedGeneric=io.readFileYAML('/Applications/OpenAF/oJob-common/oJobBrowse.yaml').jobs.filter(j=>j.name=='HTTP Browse generic')[0]
new Function('args',installedGeneric.exec)(legacy)
var registered=global.__GBHTTPD['4/legacy']
equal(registered._fns.getList({uri:'/legacy/',params:{}},registered).isList,true)
var legacyCA=run('../openaf-opacks/AWS/oJobCodeArtifact.yaml','HTTP Browse - codeartifact',{port:6,uri:'/legacyca',path:'',templates:{},options:{}},true)
legacyCA.templates={}
new Function('args',installedGeneric.exec)(legacyCA)
var oldCA=global.__GBHTTPD['6/legacyca']
equal(oldCA._fns.getList({uri:'/legacyca/',params:{}},oldCA).isList,true)
var legacyS3=run(s3,'HTTP Browse - s3',{url:'http://example.invalid',bucket:'b',port:7,uri:'/legacys3',path:'',cache:1000,options:{}},true)
legacyS3.templates={}
new Function('args',installedGeneric.exec)(legacyS3)
var oldS3=global.__GBHTTPD['7/legacys3']
equal(oldS3._fns.getList({uri:'/legacys3/',params:{}},oldS3).isList,true)
var forbidden=false
sa.restrict=['hidden$']
try{sa.fns.getObj({uri:'/s3/hidden/a.xml',params:{raw:'true'}},so)}catch(e){forbidden=e.httpStatus==403}
equal(forbidden,true)
FakeAWS.prototype.ECR_DescribeRepositories=function(){return [{repositoryName:'team/private'}]}
var hidden=run(ecr,'HTTP Browse - ecr',{port:5,uri:'/hidden',path:'',restrict:['team$'],options:{query:{enabled:true}}}),ho=options(hidden)
equal(hidden.fns.getList({uri:'/hidden/',params:{}},ho).list.length,0)
equal(hidden.fns.search({uri:'/hidden/',params:{q:'private'}},ho).list.length,0)
print('PASS '+checks+' provider assertions')
