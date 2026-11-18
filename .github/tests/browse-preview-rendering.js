// Run from oJob-common with oaf -f .github/tests/browse-preview-rendering.js.
// Set CORE_BROWSE_MODULE to a checkout or staged OpenAF browse module.
ow.loadServer()
ow.loadTemplate()
ow.loadFormat()

const browse = io.readFileYAML("oJobBrowse.yaml")
const httpd = io.readFileYAML("oJobHTTPd.yaml")
require.cache = require.cache || {}
require.cache["ojob-browse-contract.js"] = new Function("require", "exports", "module", browse.code["ojob-browse-contract.js"])
load(getEnv("CORE_BROWSE_MODULE") || "../openaf/js/owrap.server.browse.js")

const root = String(java.nio.file.Files.createTempDirectory("browse-previews-"))
const port = 19867
const server = {
  getPort: () => port,
  replyOKHTML: data => ({ data: String(data), status: 200 }),
  reply: (data, mime, status) => ({ data: String(data), status: status })
}
var checks = 0
function check(value, label) {
  checks++
  if (!value) throw new Error(label)
}
function job(yaml, name) { return yaml.jobs.find(definition => definition.name == name) }
function run(job, args) { new Function("args", job.exec)(args) }
function route(job) { return new Function("request", "server", "port", "uri", job.args.execURI) }
function checkSource(response, language, expected, label) {
  const html = response.data
  const block = html.match(new RegExp('<pre><code class="language-' + language + '">([\\s\\S]*?)</code></pre>'))
  check(block && !block[1].includes("<") && ow.format.unescapeHTML4(block[1]) === expected, label)
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
  io.writeFileString(root + "/sample.md", "# Preview heading\n\nParagraph with 'quoted text'.\n")
  io.writeFileString(root + "/sample.adoc", "= Preview heading\n\nParagraph with 'quoted text'.\n")

  for (let name of Object.keys(serve)) {
    for (let ext of Object.keys(formats)) checkSource(serve[name]("sample."+ext), formats[ext], source, name+" "+ext+" literal source")
    const json = serve[name]("sample.json", {parse:"false"}).data.match(/<pre><code class="language-json">([\s\S]*?)<\/code><\/pre>/)
    check(json && JSON.parse(ow.format.unescapeHTML4(json[1])).entity === "&#x27;" &&
      JSON.parse(ow.format.unescapeHTML4(json[1])).title === "O'Reilly", name+" JSON source")
    check(serve[name]("sample.json").data.includes("nJSMap"), name+" JSON map still renders")
    check(serve[name]("sample.md").data.includes("Preview heading") && serve[name]("sample.md").data.includes("'quoted text'"), name+" Markdown still renders")
    if (isDef(getOPackPath("Asciidoc"))) {
      const adoc = serve[name]("sample.adoc")
      check(adoc.status === 200 && adoc.data.includes("Preview heading"), name+" AsciiDoc still renders")
    }
  }

  for (let options of [genericOptions, core]) options.preview = { formats:{xml:"xml",html:"html",yaml:"yaml"}, maxBytes:4096 }
  for (let name of ["generic", "core"]) {
    for (let ext of ["xml","html","yaml"]) checkSource(serve[name]("sample."+ext), ext, source, name+" configured "+ext+" preview")
  }
  print("PASS " + checks + " Browse preview rendering assertions")
} finally { io.rm(root) }
