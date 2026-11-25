// Run from the repository root with an OpenAF build that includes MCP skills.
ow.loadServer()
ow.loadOJob()
var mcp = ow.server.mcp

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function rpc(catalog, method, params) {
  return ow.server.jsonRPC({ jsonrpc: "2.0", id: 1, method: method, params: params || {} }, catalog.methods)
}
function checkError(catalog, uri, code) {
  var response = rpc(catalog, "resources/read", { uri: uri })
  assert(response.error && response.error.code == code, "Unexpected read error for " + uri)
}
function markdown(name) {
  return "---\nname: " + name + "\ndescription: Regression fixture.\n---\nRead the checklist.\n"
}
function manifest(path, text, ref) {
  var bytes = af.fromString2Bytes(text, "UTF-8")
  return { path: path, size: bytes.length, digest: "sha256:" + sha256(bytes), ref: ref }
}

// Verify provider reads, private refs, and digest checks independently of transport.
var reads = [], text = markdown("remote-test"), checklist = "Check the résumé.\n"
var source = {
  catalog: () => [{
    name: "remote-test",
    frontmatter: { description: "Regression fixture.", name: "remote-test" },
    files: [manifest("SKILL.md", text), manifest("references/a b.md", checklist, "version-1")]
  }],
  read: request => {
    reads.push(request)
    return request.path == "SKILL.md" ? text : checklist
  }
}
var catalog = mcp.createSkillCatalog([source])
var listed = rpc(catalog, "skills/list").result
var uri = listed.skills[0].uri
var lookup = rpc(catalog, "skills/get", { uri: uri }).result
assert(listed.resultType == "complete" && lookup.ttlMs === 0 && lookup.cacheScope == "private", "Missing result fields")
assert(compare(listed.skills[0], lookup.skill), "List and lookup disagree")
assert(reads.length == 0 && !stringify(lookup).includes("version-1"), "Discovery fetched a file or exposed a private ref")
assert(rpc(catalog, "resources/read", { uri: uri }).result.contents[0].text == text, "SKILL.md read failed")
var reference = "skill://remote-test/references/a%20b.md"
assert(rpc(catalog, "resources/read", { uri: reference }).result.contents[0].text == checklist, "Reference read failed")
assert(reads.length == 2 && reads[1].path == "references/a b.md" && reads[1].ref == "version-1", "Wrong provider input")
checklist = "Changed bytes"
checkError(catalog, reference, -32603)
checkError(catalog, "skill://remote-test/references/missing.md", -32602)
assert(reads.length == 3, "Unknown URI reached the provider")

// Catalogs reject malformed instructions before they can be advertised.
var malformed = false
try {
  mcp.createSkillCatalog([{ name: "invalid", files: { "SKILL.md": "Missing metadata" } }])
} catch (e) {
  malformed = String(e).includes("frontmatter")
}
assert(malformed, "Malformed SKILL.md was accepted")

// Generated providers receive only canonical paths in their own skill namespace.
var dynamic = mcp.createSkillCatalog([{
  catalog: [{ name: "generated", frontmatter: { name: "generated", description: "Regression fixture." }, files: "dynamic" }],
  read: request => request.path == "SKILL.md" ? markdown("generated") : null
}])
assert(rpc(dynamic, "skills/list").result.skills[0].resources == "dynamic", "Invalid dynamic manifest")
checkError(dynamic, "skill://generated/%2E%2E/secret", -32602)
checkError(dynamic, "skill://generated/references%2Fsecret", -32602)
checkError(dynamic, "skill://generated/missing.md", -32602)

// Instrument the shared oJob adapter to count S3 operations and verify cleanup.
var init = io.readFileYAML("oJobMCP.yaml").jobs.filter(job => job.name == "Prepare MCP Skills")[0].exec
var operations = [], closed = [], shutdown
function FakeS3(url) {
  var name = url == "first" ? "first-skill" : "second-skill"
  this.listObjects = (bucket, prefix, details, recursive) => {
    assert(bucket == "test-bucket" && prefix == "published/" && !details && recursive, "Wrong S3 listing scope")
    operations.push("list:" + url)
    return ["published/" + name + "/SKILL.md", "published/" + name + "/references/checklist.md",
            "published-other/excluded/SKILL.md", "published/shared.txt"].map(key => ({ filename: key, isFile: true }))
  }
  this.getObjectStream = (bucket, key) => {
    operations.push("get:" + key)
    assert(key.startsWith("published/" + name + "/"), "Read outside source")
    return new java.io.ByteArrayInputStream(af.fromString2Bytes(key.endsWith("SKILL.md") ? markdown(name) : "Checklist"))
  }
  this.close = () => closed.push(url)
}
var args = { modern: true, skills: ["first", "second"].map(url => ({
  s3: { connection: { url: url }, bucket: "test-bucket", prefix: "published" }
})) }
new Function("args", "getOPackPath", "global", "S3", "addOnOpenAFShutdown", init)(
  args, () => "fake", { S3: FakeS3 }, FakeS3, fn => { shutdown = fn })
assert(operations.length == 6, "Expected one listing and two startup reads per connection")
var s3 = args.result
assert(rpc(s3, "skills/list").result.skills.length == 2, "Unexpected S3 catalog")
rpc(s3, "skills/get", { uri: "skill://first-skill/SKILL.md" })
assert(operations.length == 6, "S3 discovery fetched an object")
var response = rpc(s3, "resources/read", { uri: "skill://first-skill/references/checklist.md" })
assert(response.result.contents[0].text == "Checklist", "S3 checklist read failed")
assert(operations.length == 7 && operations[6] == "get:published/first-skill/references/checklist.md", "Unexpected S3 read")
s3.close()
shutdown()
assert(closed.join(",") == "first,second", "S3 clients were not closed exactly once")

print("PASS MCP skill providers, manifests, scoped S3 reads and cleanup")
