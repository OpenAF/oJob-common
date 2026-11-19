// Run from the repository root: oaf -f .github/tests/browse-filename-rendering.js
ow.loadServer()
ow.loadTemplate()
ow.loadFormat()

// Execute the actual jobs with a local response adapter and no listener.
var jobs = io.readFileYAML('oJobHTTPd.yaml').jobs
var job = name => jobs.filter(j => j.name == name)[0]
var server = { replyOKHTML: data => ({ data: String(data) }) }
var port = 18091
new Function('args', job('HTTP Start Server').exec)({ port: port, hs: server })
var root = String(java.nio.file.Files.createTempDirectory('browse-filenames-'))
var names = ['_oaf', '__special__', 'a[b](c)*d`e|f&g', 'café 漢字 😀', 'literal&#95;name', '<img src=x onerror=alert(1)>']
var checks = 0
try {
  // Cover directory and file labels through the Handlebars and Markdown pipeline.
  names.forEach(name => {
    io.mkdir(root + '/' + name)
    io.writeFileString(root + '/' + name + '.txt', 'content')
  })
  var def = job('HTTP File Browse')
  new Function('args', def.exec)({ port: port, uri: '/files', path: root, browse: true, incURI: false, sortTab: false })
  var result = new Function('request', 'server', 'port', 'uri', def.args.execURI)(
    { uri: '/files/', originalURI: '/files/', params: {}, method: 'GET' }, server, port, '/files')
  var html = String(result.data)
  names.forEach(name => {
    ;[name, name + '.txt'].forEach(label => {
      var href = global.__ojobHttpFileLink(label) + (label == name ? '/' : '')
      var start = html.indexOf('<a href="' + href + '">')
      if (start < 0) throw new Error('Missing link for ' + label)
      start += ('<a href="' + href + '">').length
      var text = html.substring(start, html.indexOf('</a>', start))
      if (text.indexOf('<') >= 0 || ow.format.unescapeHTML4(text) != label) throw new Error('Incorrect label: ' + text)
      checks++
    })
  })
  if (html.indexOf('<img src=x') >= 0) throw new Error('Filename injected HTML')
  print('PASS ' + checks + ' filename rendering assertions')
} finally {
  io.rm(root)
}
