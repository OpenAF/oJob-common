ow.loadServer();ow.loadTemplate();ow.loadFormat();ow.loadCh()
new Function('args',io.readFileYAML('oJobHTTPd.yaml').jobs.filter(j=>j.name=='HTTP Start Server')[0].exec)({port:19844,hs:{}})
var checks=0, clients=0, detailCalls=0, scans=0, repositoryCalls=0, domainCalls=0, prefixes=[]
function equal(a,b){checks++;if(a!==b)throw new Error('Expected '+b+', got '+a)}
var yaml=io.readFileYAML('oJobBrowse.yaml'), support={}
new Function('exports',yaml.code['ojob-browse-contract.js'])(support)
function FakeAWS(){clients++}
FakeAWS.prototype.ECR_DescribeRepositories=function(){repositoryCalls++;return ['a','b','c'].map(n=>({repositoryName:n}))}
FakeAWS.prototype.ECR_DescribeImages=function(){detailCalls++;return [{imageDigest:'sha256:'+'a'.repeat(64),imagePushedAt:1711050000,lastRecordedPullTime:1711050000,imageTags:['latest']}]}
FakeAWS.prototype.CODEARTIFACT_ListDomains=function(){domainCalls++;return [{domainName:'d',createdTime:1711050000}]}
FakeAWS.prototype.CODEARTIFACT_ListRepositories=function(){return [{repositoryName:'r',domainName:'d'}]}
FakeAWS.prototype.CODEARTIFACT_ListPackages=function(){return [{format:'generic',package:'z'},{format:'generic',package:'a'}]}
FakeAWS.prototype.CODEARTIFACT_ListPackageVersions=function(){return [{version:'2',publishedTime:1711050000},{version:'1',publishedTime:1710963600}]}
FakeAWS.prototype.CODEARTIFACT_ListPackageVersionAssets=function(){return [{name:'asset.xml',size:20}]}
function FakeS3(){clients++}
FakeS3.prototype.listObjects=function(bucket,prefix){prefixes.push(prefix);return [{filename:'a.xml',isFile:true,size:20,lastModified:1711050000000}]}
FakeS3.prototype.walkObjects=function(bucket,prefix,callback){scans++;callback({filename:prefix+'a.xml',isFile:true,size:20,lastModified:1711050000000});return {complete:true,totalExact:true,scanned:1}}
FakeS3.prototype.getObjectStream=function(bucket,key,offset,len){return af.fromString2InputStream('<root>complete</root>'.substring(0,len||100))}
function modules(definition, missing) {
  return function loadModule(name) {
    if (missing) throw Error('missing')
    if (name == 'ojob-browse-contract.js') return support
    var exported = {}
    new Function('require','exports',definition.code[name])(loadModule,exported)
    return exported
  }
}
function run(file,name,args,missing,schedule){
  var definition = io.readFileYAML(file), job = definition.jobs.find(j => j.name == name)
  new Function('args','loadLib','load','AWS','S3','require','$doV',job.exec)(args,()=>{},()=>{},FakeAWS,FakeS3,modules(definition, missing),schedule || $doV)
  return args
}
function options(args){var o=Object.assign({},args.options,{parentURI:args.uri,parentPath:args.path||'',port:1});args.fns.init(o);return o}
var packs = getEnv('BROWSE_OPACKS') || '../openaf-opacks'
var ecr=packs+'/AWS/oJobECR.yaml', s3=packs+'/S3/oJobS3.yaml'
var failed=false
try{run(ecr,'HTTP Browse - ecr',{options:{query:{enabled:true}}},true)}catch(e){failed=true}
equal(failed,true);equal(clients,0)
var args=run(ecr,'HTTP Browse - ecr',{port:1,uri:'/ecr',path:'',options:{query:{enabled:true,pageSize:1}}})
var opts=options(args)
equal(repositoryCalls,1)
var result=args.fns.getList({uri:'/ecr/',params:{}},opts)
equal(repositoryCalls,1)
// ECR summaries load asynchronously; wait for the mock image request to finish.
var summaryDeadline=now()+5000, summary=result.list[0].values
while ((!detailCalls || !summary['Last Push']) && now()<summaryDeadline) {
  sleep(10,true)
  summary=args.fns.getList({uri:'/ecr/',params:{}},opts).list[0].values
}
equal(result.list.length,1);equal(result.pageInfo.total,3);equal(detailCalls,1)
equal(summary['Last Push'],'2024-03-21 19:40:00');equal(summary['Last Pull'],'2024-03-21 19:40:00')
args.fns.getList({uri:'/ecr/',params:{}},opts);equal(detailCalls,1)
var beforeAPI=clients, api=run(ecr,'HTTP Browse - ecr - API',{options:{query:{enabled:true}}})
equal(clients,beforeAPI)
var sa=run(s3,'HTTP Browse - s3',{url:'http://example.invalid',bucket:'b',port:2,uri:'/s3',path:'',cache:10000,options:{query:{enabled:true},preview:{formats:{xml:'xml'},maxBytes:5}}})
var so=options(sa)
equal(prefixes.join(','),'')
equal(prefixes.length,1)
equal(sa.fns.getList({uri:'/s3/',params:{}},so).list[0].values['Last modified'],ow.format.fromDate(new Date('2024-03-21T19:40:00Z'),'yyyy-MM-dd HH:mm:ss'))
equal(prefixes.length,1)
var prefixed=run(s3,'HTTP Browse - s3',{url:'http://example.invalid',bucket:'b',port:8,uri:'/prefixed',path:'team/',options:{}})
var po=options(prefixed)
equal(prefixes[prefixes.length-1],'team/')
var prefixCount=prefixes.length
prefixed.fns.getList({uri:'/prefixed/',params:{}},po)
equal(prefixes.length,prefixCount)
var req={uri:'/s3/',params:{q:'xml'}}
equal(sa.fns.search(req,so).list.length,1);sa.fns.search(req,so);equal(scans,1)
equal(sa.fns.getObj({uri:'/s3/a.xml',params:{}},so).truncated,true)
var raw=sa.fns.getObj({uri:'/s3/a.xml',params:{raw:'true'}},so)
try{equal(String(af.fromInputStream2String(raw.stream)),'<root>complete</root>')}finally{raw.stream.close()}
var ca=run(packs+'/AWS/oJobCodeArtifact.yaml','HTTP Browse - codeartifact',{port:3,uri:'/ca',path:'',options:{query:{enabled:true,pageSize:1}}})
var co=options(ca)
equal(domainCalls,1)
equal(ca.fns.getList({uri:'/ca/',params:{}},co).list[0].values.Created,'2024-03-21 19:40:00')
equal(domainCalls,1)
equal(ca.fns.getList({uri:'/ca/d/r/generic/a/',params:{}},co).list[0].values.Published,'2024-03-21 19:40:00')
var cr={uri:'/ca/d/r/generic/',params:{sort:'Package',order:'desc'}}
var candidates=ca.fns.getList(cr,co), paged=support.query(candidates,cr,co)
equal(candidates.list.length,2);equal(paged.list.length,1);equal(paged.list[0].values.Package,'z')
var search=ca.fns.search({uri:'/ca/d/r/',params:{q:'generic'}},co)
equal(search.list.length,2);equal(search.searchInfo.complete,false)
equal(ca.fns.getFreshness({uri:'/ca/d/r/',params:{}},co).loadedAt>0,true)
equal(args.fns.search({uri:'/ecr/',params:{q:'a'}},opts).list.length,1)
opts.query.wildcards=true
equal(args.fns.search({uri:'/ecr/',params:{q:'?'}},opts).list.length,3)
co.query.wildcards=true
equal(ca.fns.search({uri:'/ca/d/r/',params:{q:'*/generic/?'}},co).list.length,2)
so.query.wildcards=true
equal(sa.fns.search({uri:'/s3/',params:{q:'?.XML'}},so).list.length,1)
equal(scans,1)
var legacy=run(ecr,'HTTP Browse - ecr',{port:4,uri:'/legacy',options:{}},true)
equal(isFunction(legacy.fns.getList),true)
legacy.templates={};legacy.path=''
var installedGeneric=io.readFileYAML('/Applications/OpenAF/oJob-common/oJobBrowse.yaml').jobs.filter(j=>j.name=='HTTP Browse generic')[0]
new Function('args',installedGeneric.exec)(legacy)
var registered=global.__GBHTTPD['4/legacy']
equal(registered._fns.getList({uri:'/legacy/',params:{}},registered).isList,true)
var legacyCA=run(packs+'/AWS/oJobCodeArtifact.yaml','HTTP Browse - codeartifact',{port:6,uri:'/legacyca',path:'',templates:{},options:{}},true)
legacyCA.templates={}
new Function('args',installedGeneric.exec)(legacyCA)
var oldCA=global.__GBHTTPD['6/legacyca']
equal(oldCA._fns.getList({uri:'/legacyca/',params:{}},oldCA).isList,true)
var legacyS3=run(s3,'HTTP Browse - s3',{url:'http://example.invalid',bucket:'b',port:7,uri:'/legacys3',path:'',cache:1000,options:{}})
legacyS3.templates={}
new Function('args',installedGeneric.exec)(legacyS3)
var oldS3=global.__GBHTTPD['7/legacys3']
equal(oldS3._fns.getList({uri:'/legacys3/',params:{}},oldS3).isList,true)
var site = 'site marker'
var opened = []
var streamFixture = FakeS3.prototype.getObjectStream
FakeS3.prototype.getObjectStream = function(bucket,key,offset,len) {
  opened.push({key:key,len:len})
  return af.fromString2InputStream(key.endsWith('.md') ? '# Heading\n\n**Formatted**\n\n<form>Removed</form>' :
    key.endsWith('.json') ? isDef(len) ? 'x'.repeat(len) : '{"complete":true}' : site)
}
try {
  var siteReq = {uri:'/legacys3/index.html',params:{}}
  var raw = oldS3._fns.getObj(Object.assign({},siteReq,{params:{raw:'true'}}),oldS3)
  equal(raw.streamType,'application/octet-stream')
  equal(raw.streamHeaders['Content-Disposition'].startsWith('attachment'),true)
  equal(String(af.fromInputStream2String(raw.stream)),site)
  var htmlOptions = Object.assign({},oldS3,{preview:{maxBytes:1}})
  var htmlPreview = oldS3._fns.getObj(siteReq,htmlOptions)
  equal(htmlPreview.streamType,'text/html')
  equal(htmlPreview.streamHeaders['Content-Security-Policy'].startsWith('sandbox;'),true)
  equal(isUnDef(htmlPreview.streamHeaders['Content-Disposition']),true)
  equal(isUnDef(opened[opened.length-1].len),true)
  equal(String(af.fromInputStream2String(htmlPreview.stream)),site)
  var image = oldS3._fns.getObj({uri:'/legacys3/photo.JPG',params:{}},htmlOptions)
  equal(image.streamType,'image/jpeg')
  equal(image.streamHeaders['Content-Disposition'],'inline')
  equal(isUnDef(opened[opened.length-1].len),true)
  equal(String(af.fromInputStream2String(image.stream)),site)
  var web = Object.assign({},oldS3,{web:{enabled:true}})
  var inline = oldS3._fns.getObj(siteReq,web)
  equal(inline.streamType.split(';')[0],'text/html')
  equal(isUnDef(inline.streamHeaders['Content-Disposition']),true)
  equal(String(af.fromInputStream2String(inline.stream)),site)
  var opens = opened.length
  var jsonViewer = oldS3._fns.getObj({uri:'/legacys3/file.json',params:{}},oldS3)
  equal(jsonViewer.jsonViewer,true)
  equal(opened.length,opens)
  var jsonData = oldS3._fns.getObj({uri:'/legacys3/file.json',params:{view:'json-data'}},oldS3)
  equal(String(af.fromInputStream2String(jsonData.stream)),'{"complete":true}')
  equal(isUnDef(opened[opened.length-1].len),true)
  var oversized = oldS3._fns.getObj({uri:'/legacys3/file.json',params:{view:'source'}},oldS3)
  equal(oversized.truncated,true)
  equal(opened[opened.length-1].len,4*1024*1024+1)
  equal(oversized.data.includes('language-text'),true)
  var markdown = oldS3._fns.getObj({uri:'/legacys3/file.md',params:{}},oldS3)
  equal(markdown.data.includes('<strong>Formatted</strong>'),true)
  equal(markdown.data.includes('<form>'),false)
  var s3Definition = io.readFileYAML(s3)
  var legacyRoute = new Function('request','server','port','uri','require',s3Definition.jobs.find(j => j.name == 'HTTP S3 Browse').args.execURI)
  var siteList = FakeS3.prototype.listObjects
  FakeS3.prototype.listObjects = (bucket,key) => !key.length ?
    [{ filename:'index.html', filepath:'index.html', isFile:true }] : []
  try {
    var legacyOptions = {url:'http://example.invalid',bucket:'b',port:8,uri:'/site',path:'',cache:0,browse:false,default:'index.html',options:{web:{enabled:true}}}
    run(s3,'HTTP S3 Browse',legacyOptions)
    var server = {
      replyStream: (stream,type,status,headers) => ({stream,type,status,headers}),
      replyOKHTML: data => ({data, status:200}),
      reply: (data,type,status) => ({data,type,status})
    }
    var serve = path => legacyRoute({uri:path,params:{}},server,8,'/site',modules(s3Definition))
    var index = serve('/site/')
    equal(index.type.split(';')[0],'text/html')
    equal(String(af.fromInputStream2String(index.stream)),site)
    equal(serve('/site/../index.html').status,403)
    var source = serve("/site/a'b.js")
    equal(source.type.split(';')[0],ow.server.httpd.getMimeType('a.js').split(';')[0])
    source.stream.close()
    run(s3,'HTTP S3 Browse',Object.assign({},legacyOptions,{uri:'/preview',options:{}}))
    var legacyHTML = legacyRoute({uri:'/preview/file.htm',params:{}},server,8,'/preview',modules(s3Definition))
    equal(legacyHTML.type,'text/html')
    equal(legacyHTML.headers['Content-Security-Policy'].startsWith('sandbox;'),true)
    equal(isUnDef(legacyHTML.headers['Content-Disposition']),true)
    equal(String(af.fromInputStream2String(legacyHTML.stream)),site)
    for (var name of ['file.yaml','file.md','file.json']) {
      var preview = legacyRoute({uri:'/preview/'+name,params:{}},server,8,'/preview',modules(s3Definition))
      equal((String(preview.data).match(/aria-label="Back"/g) || []).length,1)
    }
  } finally { FakeS3.prototype.listObjects = siteList }

  FakeS3.prototype.close = () => {}
  var described = run(ecr,'HTTP Browse - ecr',{port:9,uri:'/described',path:'',s3bucket:'b',s3prefix:'desc/',options:{query:{enabled:true}}})
  var describedOptions = options(described)
  var listing = described.fns.getList({uri:'/described/',params:{}},describedOptions)
  var detail = described.fns.getObj({uri:'/described/a',params:{}},describedOptions)
  ;[markdown.data,listing.content,detail.data].forEach(content => {
    var html = String(ow.template.parseMD2HTML(content,true))
    equal(html.includes('<strong>Formatted</strong>'),true)
    equal(html.includes('<form>'),false)
  })
} finally { FakeS3.prototype.getObjectStream = streamFixture }
var forbidden=false
sa.restrict=['hidden$']
try{sa.fns.getObj({uri:'/s3/hidden/a.xml',params:{raw:'true'}},so)}catch(e){forbidden=e.httpStatus==403}
equal(forbidden,true)
FakeAWS.prototype.ECR_DescribeRepositories=function(){return [{repositoryName:'team/private'}]}
var hidden=run(ecr,'HTTP Browse - ecr',{port:5,uri:'/hidden',path:'',restrict:['team$'],options:{query:{enabled:true}}}),ho=options(hidden)
equal(hidden.fns.getList({uri:'/hidden/',params:{}},ho).list.length,0)
equal(hidden.fns.search({uri:'/hidden/',params:{q:'private'}},ho).list.length,0)
// A search consumes published batches without scheduling another remote load.
var scheduled = [], stagedScans = 0
var pollHeaders = {"x-openaf-browse-fragment":"1"}
var browserSearch = (uri, q, fragment, all) => ({
  uri: uri, method: "GET", params: { q: q, searchAll: all ? "1" : undefined }, header: fragment ? pollHeaders : {}
})
var progressive = run(s3, 'HTTP Browse - s3',
  {url:'http://example.invalid',bucket:'b',port:9,uri:'/progress',path:'',options:{query:{enabled:true}}},
  false, fn => scheduled.push(fn))
var progressOptions = options(progressive)
var pollS3 = q => progressive.fns.search(browserSearch('/progress/', q, true), progressOptions)
FakeS3.prototype.walkObjects = function(bucket, prefix, visit) {
  stagedScans++
  visit({filename:prefix+'alpha',isFile:true,size:1})
  equal(pollS3('alpha').list.length, 1)
  equal(pollS3('beta').searchInfo.refreshing, true)
  visit({filename:prefix+'beta',isFile:true,size:1})
  return {scanned:2,complete:false,timedOut:true}
}
equal(pollS3('alpha').searchInfo.ready, false)
equal(scheduled.length, 0)
equal(progressive.fns.search(browserSearch('/progress/', 'alpha'), progressOptions).searchInfo.refreshing, true)
progressive.fns.search(browserSearch('/progress/', 'beta'), progressOptions)
equal(scheduled.length, 1)
scheduled.shift()()
equal(pollS3('beta').list.length, 1)
equal(pollS3('beta').searchInfo.message.includes('scan limit reached'), true)
equal(stagedScans, 1)

var stagedPackages = 0
var artifact = run(packs+'/AWS/oJobCodeArtifact.yaml', 'HTTP Browse - codeartifact',
  {port:10,uri:'/packages',path:'',restrict:['private$'],options:{query:{enabled:true}}},
  false, fn => scheduled.push(fn))
var artifactOptions = options(artifact)
var pollPackages = q => artifact.fns.search(browserSearch('/packages/d/', q, true), artifactOptions)
FakeAWS.prototype.CODEARTIFACT_ListRepositories = () => [{domainName:'d',name:'r'},{domainName:'d',name:'private'}]
FakeAWS.prototype.CODEARTIFACT_ListPackages = (region, repository, domain, format, namespace, publish) => {
  stagedPackages++
  var first = {format:'generic',package:'alpha'}, second = {format:'generic',package:'beta'}
  publish([first])
  equal(pollPackages('alpha').list.length, 1)
  equal(pollPackages('beta').searchInfo.refreshing, true)
  publish([second])
  return [first, second]
}
equal(pollPackages('alpha').searchInfo.canExpand, true)
equal(scheduled.length, 0)
var incomplete = artifact.fns.search(browserSearch('/packages/d/', 'alpha', false, true), artifactOptions)
equal(incomplete.searchInfo.message.includes('0 of 1'), true)
equal(scheduled.length, 1)
scheduled.shift()()
equal(pollPackages('beta').searchInfo.complete, true)
equal(pollPackages('beta').list.length, 1)
equal(stagedPackages, 1)

FakeAWS.prototype.ECR_DescribeRepositories = () => [{repositoryName:'repo'}]
var imageDigest = 'sha256:' + 'a'.repeat(64)
FakeAWS.prototype.ECR_DescribeImages = () => [
  {imageDigest:imageDigest,imageTags:['1.10.0','1.2.0'],imagePushedAt:1711050000,imageSizeInBytes:42},
  {imageDigest:'sha256:' + 'b'.repeat(64),imageTags:['2.0.0'],imagePushedAt:1711050100,imageSizeInBytes:24}
]
var images = run(ecr, 'HTTP Browse - ecr',
  {port:11,uri:'/images',path:'',options:{query:{enabled:true},imageDetails:true}})
var imageOptions = Object.assign(options(images), {sortTab:true})
var listingRequest = browserSearch('/images/repo/', '')
listingRequest.params.size = '1'
var imageListing = images.fns.getList(listingRequest, imageOptions)
var firstImagePage = support.query(imageListing, listingRequest, imageOptions)
equal(firstImagePage.sortInfo.field, 'Pushed')
equal(firstImagePage.sortInfo.order, 'desc')
equal(firstImagePage.list[0].values.Tag, '2.0.0')
var legacyTags = images.fns.getObj(browserSearch('/images/repo/', ''), imageOptions).data
equal(legacyTags.indexOf('>2.0.0</a>') < legacyTags.indexOf('>1.2.0</a>'), true)
equal(legacyTags.includes('aria-label="Descending Pushed at" title="Descending Pushed at" aria-current="true"'), true)
equal(imageListing.isList, true)
equal(imageListing.content.includes('/js/mdtablesort.js'), false)
equal((imageListing.content.match(/ecr-server-sort" tabindex/g) || []).length, 7)
var pullDescending = browserSearch('/images/repo/', '')
Object.assign(pullDescending.params, {detailTable:'pull',detailSort:'Tag',detailOrder:'desc'})
var sortedDetails = images.fns.getList(pullDescending, imageOptions).content
equal(sortedDetails.indexOf('>1.10.0</a>') < sortedDetails.indexOf('>1.2.0</a>'), true)
equal(sortedDetails.includes('aria-label="Descending Tag" title="Descending Tag" aria-current="true"'), true)
equal(images.fns.getObj(browserSearch('/images/repo/', ''), imageOptions).data.includes('/js/mdtablesort.js'), false)
var imageRequest = browserSearch('/images/repo/', 'aaaa', true)
imageRequest.params.sort = 'Tag'
var matches = support.query(images.fns.search(imageRequest, imageOptions), imageRequest, imageOptions).list
equal(matches.length, 2)
equal(matches[0].values.Tag, '1.2.0')
equal(matches[0].imageDigest, imageDigest)
equal(images.fns.search(browserSearch('/images/repo/', '1.10', true), imageOptions).list.length, 1)
print('PASS '+checks+' provider assertions')
