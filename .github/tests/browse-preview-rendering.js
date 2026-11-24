// Run from oJob-common with oaf -f .github/tests/browse-preview-rendering.js.
// Set CORE_BROWSE_MODULE to a checkout or staged OpenAF browse module.
ow.loadServer()
ow.loadTemplate()
ow.loadFormat()

const browse = io.readFileYAML("oJobBrowse.yaml")
const httpd = io.readFileYAML("oJobHTTPd.yaml")
require.cache = require.cache || {}
Object.keys(browse.code).forEach(name => {
  require.cache[name] = new Function("require", "exports", "module", browse.code[name])
})
load(getEnv("CORE_BROWSE_MODULE") || "../openaf/js/owrap.server.browse.js")

const root = String(java.nio.file.Files.createTempDirectory("browse-previews-"))
const port = 19867
const server = {
  getPort: () => port,
  replyOKHTML: data => ({ data: String(data), status: 200 }),
  replyStream: (stream, type, status, headers) => type && type.startsWith("image/") ?
    { base64: String(java.util.Base64.getEncoder().encodeToString(stream.readAllBytes())), type, headers } :
    { data: String(af.fromInputStream2String(stream)), type, status: 200, headers },
  reply: (data, mime, status) => ({ data: String(data), status: status })
}
var checks = 0
function check(value, label) {
  checks++
  if (!value) throw new Error(label)
}
function job(yaml, name) { return yaml.jobs.find(definition => definition.name == name) }
function run(job, args) {
  // oJob appends the downstream service setup to the same function.
  if (new Function("args", job.exec + "\nreturn true")(args) !== true) throw new Error(job.name + " skipped downstream setup")
}
function route(job) { return new Function("request", "server", "port", "uri", job.args.execURI) }
function checkSource(response, language, expected, label) {
  const html = response.data
  const block = html.match(new RegExp('<pre><code class="language-' + language + '">([\\s\\S]*?)</code></pre>'))
  check(block && !block[1].includes("<") && ow.format.unescapeHTML4(block[1]) === expected, label)
}
function checkBack(response, label) {
  const buttons = String(response.data).match(/<button[^>]*onclick="history\.back\(\)"[^>]*aria-label="Back"[^>]*style="float:right[^>]*>/g)
  check(buttons && buttons.length === 1, label + " has one top-right Back button")
}

try {
  run(job(httpd, "HTTP Start Server"), { port: port, hs: server })
  ow.server.httpd.__routes[port] = {}
  const generic = job(browse, "HTTP Browse generic")
  const legacy = job(httpd, "HTTP File Browse")
  run(generic, { port:port, uri:"/generic", path:root, templates:{}, options:{}, fns:{} })
  run(legacy, { port:port, uri:"/legacy", path:root, browse:true, incURI:false, sortTab:false })
  const core = ow.server.httpd.browse.files("/core", { path:root })
  const genericOptions = global.__GBHTTPD[String(port) + "/generic"]
  const serve = {
    generic: (file, params) => route(generic)({uri:"/generic/"+file, params:params||{}, method:"GET"}, server, port, "/generic"),
    legacy: (file, params) => route(legacy)({uri:"/legacy/"+file, params:params||{}, method:"GET"}, server, port, "/legacy"),
    core: (file, params) => ow.server.httpd.replyBrowse(server, {uri:"/core/"+file, params:params||{}, method:"GET"}, core)
  }
  const source = "title: 'O’Reilly'\n\n<tag> & &#x27; &lt; café {{name}}\n`fence`\n"
  const formats = { yml:"yaml", yaml:"yaml", css:"css", sh:"sh", js:"js", java:"java", py:"python", toml:"toml", hbs:"handlebars" }
  Object.keys(formats).forEach(ext => io.writeFileString(root + "/sample." + ext, source))
  io.writeFileString(root + "/sample.xml", source)
  io.writeFileString(root + "/sample.html", source)
  io.writeFileString(root + "/sample.json", JSON.stringify({ title:"O'Reilly", entity:"&#x27;" }) + "\n")
  const markdown = "# Preview heading\n\nParagraph with 'quoted text'.\n"
  io.writeFileString(root + "/sample.md", markdown)
  io.writeFileString(root + "/sample.adoc", "= Preview heading\n\nParagraph with 'quoted text'.\n")

  run(generic, { port:port, uri:"/markdown", path:root, templates:{}, fns:{},
    options:{browse:true, default:"sample.md", preview:{maxBytes:1}} })
  const serveMarkdown = (file, params) => route(generic)({uri:"/markdown/"+file, params:params||{}, method:"GET"}, server, port, "/markdown")
  for (let file of ["sample.md", ""]) {
    const page = serveMarkdown(file)
    check(page.status === 200 && /<h1[^>]*>.*Preview heading<\/h1>/.test(page.data) &&
      page.data.includes("'quoted text'") && !page.data.includes('aria-label="Back"') &&
      !page.data.includes("Preview truncated"), "Browse renders complete Markdown at /markdown/"+file)
  }
  check(serveMarkdown("sample.md", {raw:"true"}).data === markdown, "Browse streams raw Markdown unchanged")
  const api = job(browse, "HTTP Browse API")
  run(api, { port:port, uri:"/api", browseUri:"/markdown" })
  const servePreview = () => route(api)({uri:"/api", params:{action:"preview", path:"sample.md"}, method:"GET"}, server, port, "/api")
  check(servePreview().data.includes("Preview truncated"), "Explicit Markdown preview respects the byte limit")
  const markdownOptions = global.__GBHTTPD[String(port) + "/markdown"]
  markdownOptions.preview = {formats:{}}
  check(serveMarkdown("sample.md").data.includes("'quoted text'"), "Browse renders Markdown with an empty preview format map")
  markdownOptions.preview = {}
  checkBack(servePreview(), "Explicit Markdown preview")

  io.mkdir(root + "/nested")
  io.writeFileString(root + "/nested/a #.JSON", '{"value":1}')
  io.writeFileString(root + "/report.json", '{"value":2}')
  run(generic, { port:port, uri:"/actions", path:root, templates:{}, fns:{},
    options:{browse:true, web:{enabled:true, fileActions:{
      json:"preview", md:"inline", "name:report.json":"download"
    }}, query:{enabled:true}, preview:{maxBytes:8}} })
  const actions = global.__GBHTTPD[String(port) + "/actions"]
  const serveAction = (file, params, header) => route(generic)({uri:"/actions/"+file,
    params:params||{}, header:header||{}, method:"GET"}, server, port, "/actions")
  const listing = serveAction("").data
  check(listing.includes('href="sample.json?action=preview"'), "Listing selects the JSON viewer")
  check(listing.includes('href="sample.md?action=inline"'), "Listing selects the inline action")
  check(listing.includes('<a href="report.json?raw=true">report.json</a>'), "Exact name overrides extension")
  check(listing.includes('href="sample.html"') && listing.includes('href="nested/"'), "Unmatched files and directories use ordinary links")
  const fragment = serveAction("", {q:".json"}, {"x-openaf-browse-fragment":"1"})
  check(fragment.data.includes('href="nested/a%20%23.JSON?action=preview"'), "Live search escapes nested uppercase JSON results")
  check(serveAction("", {q:".json"}).data.includes('href="nested/a%20%23.JSON?action=preview"'), "Full search uses the same links")
  check(serveAction("nested/a #.JSON", {action:"preview"}).data.includes('data-json-render'), "Preview opens the viewer")
  check(serveAction("nested/a #.JSON", {action:"preview", view:"json-data"}).data === '{"value":1}', "Viewer fetches original JSON")
  check(serveAction("nested/a #.JSON", {action:"preview", view:"source"}).data.includes('action=preview&amp;view=json'),
    "Source keeps the preview action when linking back to the viewer")
  check(serveAction("sample.md", {action:"inline"}).data === markdown, "Inline bypasses Markdown rendering")
  check(serveAction("sample.md").data.includes("Preview heading") && serveAction("sample.md").data !== markdown,
    "The plain object URL keeps Markdown rendering")
  check(serveAction("sample.md", {action:"preview"}).data.includes("Preview truncated"), "Explicit preview uses the preview limit")
  check(serveAction("sample.json", {action:"inline"}).data.includes('data-json-render'), "Inline requires a matching rule")
  const download = serveAction("report.json", {raw:"true"})
  check(download.data === '{"value":2}' && download.headers["Content-Disposition"].startsWith("attachment;"), "Download streams an attachment")
  check(serveAction("../report.json", {action:"preview"}).status === 403, "Preview preserves path validation")
  actions.noRaw = true
  check(serveAction("").data.includes('<a href="report.json">report.json</a>') && !serveAction("").data.includes("?raw=true"),
    "Disabling raw overrides the download rule and hides download arrows")
  check(serveAction("report.json", {raw:"true"}).data.includes("data-json-render"), "Disabling raw also applies to direct requests")
  actions.web.enabled = false
  check(serveAction("").data.includes('<a href="sample.json">sample.json</a>'), "Disabled web serving ignores file actions")
  try {
    run(generic, { port:port, uri:"/bad-actions", path:root, templates:{}, fns:{},
      options:{web:{enabled:true, fileActions:{json:"invalid"}}} })
    check(false, "Reject unknown actions")
  } catch (e) {
    check(e.httpStatus === 400 && String(e.message).includes("web.fileActions"), "Reject unknown actions")
  }

  const oldOptions = {old:true, preview:{maxBytes:0, formats:{}}, query:{enabled:true, pageSize:0},
    operations:{enabled:true}, prefetch:true, fullWidth:true, web:{enabled:true}}
  let searchCalls = 0
  run(generic, { port:port, uri:"/old", path:root, options:oldOptions, fns:{search:() => {
    searchCalls++
    return {isList:true, list:[]}
  }} })
  const oldBrowser = job(browse, "HTTP Browser")
  run(oldBrowser, { port:port, uri:"/old-files", type:"files", options:Object.assign({path:root},oldOptions) })
  for (let [jobDefinition, mount] of [[generic,"/old"], [oldBrowser,"/old-files"]]) {
    const serveOld = (file, params, header) => route(jobDefinition)({uri:mount+"/"+file, params:params||{},
      header:header||{}, method:"GET"}, server, port, mount)
    const oldMarkdown = serveOld("sample.md").data
    check(oldMarkdown === ow.template.parseMD2HTML(markdown, true), mount+" renders Markdown directly with browse omitted")
    check(serveOld("sample.md", {raw:"true"}).data === markdown, mount+" streams original Markdown")
    const oldJSON = serveOld("sample.json").data
    check(oldJSON.includes("nJSMap") && !oldJSON.includes("data-json-render") && !oldJSON.includes('aria-label="Back"'),
      mount+" renders JSON on the server without the preview viewer")
    const oldListing = serveOld("", {q:"unknown", page:2, _browsePrefetch:"1"}, {"x-openaf-browse-prefetch":"1"}).data
    check(oldListing.includes("sample.md") && oldListing.includes("sample.xml") && !oldListing.includes('id="browse-listing"'),
      mount+" serves the whole legacy listing without query or prefetch handling")
    const addedFile = mount.substring(1)+".txt"
    io.writeFileString(root + "/" + addedFile, "new")
    check(serveOld("").data.includes(addedFile), mount+" lists newly created files immediately")
    check(serveOld("@@/status").data.includes("No content found"), mount+" has no operations route")
  }
  check(searchCalls === 0, "Legacy listing does not call provider search")
  run(api, {port:port, uri:"/api", browseUri:"/old", operationsBrowseUris:["/old"], options:{preview:{maxBytes:1}}})
  const serveOldAPI = params => route(api)({uri:"/api", params:params, method:"GET"}, server, port, "/api")
  for (let action of ["preview", "status", "freshness", "metrics", "refresh"]) {
    check(serveOldAPI({action:action}).status === 501, "Legacy API disables "+action)
  }
  check(serveOldAPI({action:"obj", raw:"true", path:"sample.md"}).data === markdown, "Legacy API still serves raw objects")
  check(serveOldAPI({action:"search"}).status === 200 && searchCalls === 1, "Legacy API keeps a supplied search callback")

  for (let name of Object.keys(serve)) {
    for (let ext of Object.keys(formats)) {
      var response = serve[name]("sample."+ext)
      checkSource(response, formats[ext], source, name+" "+ext+" literal source")
      checkBack(response, name+" "+ext)
    }
    checkBack(serve[name]("sample.json", {parse:"false"}), name+" JSON source")
    checkBack(serve[name]("sample.json"), name+" rendered JSON")
    checkBack(serve[name]("sample.md"), name+" rendered Markdown")
    const json = serve[name]("sample.json", {parse:"false"}).data.match(/<pre><code class="language-json">([\s\S]*?)<\/code><\/pre>/)
    check(json && JSON.parse(ow.format.unescapeHTML4(json[1])).entity === "&#x27;" &&
      JSON.parse(ow.format.unescapeHTML4(json[1])).title === "O'Reilly", name+" JSON source")
    check(serve[name]("sample.json").data.includes("nJSMap"), name+" JSON map still renders")
    if (name != "legacy") {
      check(serve[name]("sample.json", {parse:"false"}).data.includes('href="?view=json">Render</a>'),
        name+" JSON source links to the browser renderer")
      const viewer = serve[name]("sample.json", {parse:"false", view:"json"}).data
      check(viewer.includes("data-json-render") && viewer.includes("slowAfterMs = 8000"),
        name+" explicit JSON mode overrides the legacy source option and waits eight seconds")
      check(/<h2[^>]*>\s*<button[^>]*aria-label="Back"[^>]*style="float:right[^>]*>/.test(viewer),
        name+" JSON preview has a top-right Back button in its header")
    }
    check(serve[name]("sample.md").data.includes("Preview heading") && serve[name]("sample.md").data.includes("'quoted text'"), name+" Markdown still renders")
    if (isDef(getOPackPath("Asciidoc"))) {
      const adoc = serve[name]("sample.adoc")
      check(adoc.status === 200 && adoc.data.includes("Preview heading"), name+" AsciiDoc still renders")
      checkBack(adoc, name+" rendered AsciiDoc")
    }
  }

  for (let name of Object.keys(serve)) {
    var defaultHTML = serve[name]("sample.html")
    check(defaultHTML.type.split(";")[0] == "text/html" && defaultHTML.data === source,
      name+" streams HTML verbatim with default options")
  }

  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6QAAAABJRU5ErkJggg=="
  java.nio.file.Files.write(java.nio.file.Paths.get(root + "/pixel.PNG"), java.util.Base64.getDecoder().decode(png))
  for (let options of [genericOptions, core]) options.preview = { maxBytes: 1 }
  for (let name of ["generic", "core"]) {
    const image = serve[name]("pixel.PNG")
    check(image.base64 == png && image.type == "image/png" && image.headers["Content-Disposition"] == "inline",
      name+" streams original binary image despite text preview limit")
  }

  for (let options of [genericOptions, core]) options.preview = { formats:{xml:"xml",html:"html",yaml:"yaml"}, maxBytes:4096 }
  for (let name of ["generic", "core"]) {
    for (let ext of ["xml","yaml"]) {
      var configured = serve[name]("sample."+ext)
      checkSource(configured, ext, source, name+" configured "+ext+" preview")
      checkBack(configured, name+" configured "+ext)
    }
    var html = serve[name]("sample.html")
    check(html.type == "text/html" && html.data === source, name+" streams configured HTML verbatim")
  }
  print("PASS " + checks + " Browse preview rendering assertions")
} finally { io.rm(root) }
