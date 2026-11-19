loadLib('s3.js')
loadExternalJars(getOPackPath('S3'))
var source=io.readFileString('../openaf-opacks/S3/s3.js'),start=source.indexOf('S3.prototype.walkObjects = function'),end=source.indexOf('\n};',start)+3
function Fixture(){}
new Function('S3',source.substring(start,end))(Fixture)
var consumed=0, fixture=new Fixture()
fixture._normalizeDateString=function(s){return s}
fixture.s3={listObjects:function(){return {iterator:function(){return {hasNext:function(){return consumed<100},next:function(){consumed++;return {get:function(){return {objectName:function(){return 'file'+consumed},isDir:function(){return false},size:function(){return 1},etag:function(){return 'x'},lastModified:function(){return '2026-11-17T00:00:00Z'}}}}}}}}}}
var info=fixture.walkObjects('bucket','',function(){},{maxScanned:2,timeoutMs:5000})
if(consumed!==2 || info.complete!==false || info.scanned!==2)throw new Error('S3 walker did not enforce scan budget')
print('PASS incremental S3 scan budget (2 entries consumed from 100)')
