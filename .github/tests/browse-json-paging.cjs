// Run with node from oJob-common. Execute the actual viewer script with a small DOM fixture.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const renderer = fs.readFileSync('../openaf/js/openafsigil.js', 'utf8') + '\n' +
  fs.readFileSync('../openaf/js/njsmap.js', 'utf8')

function element() {
  const attributes = {}
  return {
    children: [],
    set textContent(value) { this.text = value; this.children = [] },
    get textContent() { return this.text },
    appendChild(child) { this.children.push(child) },
    append(text) { this.children.push(text) },
    addEventListener(name, handler) { this[name] = handler },
    setAttribute(key, value) { attributes[key] = value },
    getAttribute(key) { return attributes[key] },
    querySelectorAll() {
      this.toggles = Array.from(this.innerHTML.matchAll(/data-json-open="(\d+)"/g), match => {
        const button = Object.assign(element(), {
          dataset: { jsonOpen: match[1] },
          nextElementSibling: { lastElementChild: element(), nextElementSibling: element() }
        })
        button.setAttribute('aria-expanded', 'false')
        return button
      })
      return this.toggles
    }
  }
}

async function preview(script, json) {
  const status = element()
  const map = {
    ...element(),
    classList: { add() {}, toggle() {} }
  }
  const elements = { '[data-json-source]': {}, '[data-json-render]': {}, '[role=status]': status, '.browse-json-map': map }
  const viewer = { dataset: { path: '/data.json' }, querySelector: key => elements[key] }
  const body = { classList: { contains: () => false } }
  const clock = { elapsed: 0 }
  let result, mountOptions
  const context = vm.createContext({
    document: { getElementById: () => viewer, createElement: element, body },
    location: { href: 'http://localhost/data.json' },
    URL, TextDecoder, performance: { now: () => clock.elapsed },
    fetch() {
      clock.elapsed = 5000
      return Promise.resolve(new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } }))
    },
    MutationObserver: class { observe() {} },
    record(data) { result = data },
    recordOptions(options) { mountOptions = options }
  })
  vm.runInContext(renderer + '\nvar originalRender = nJSMap; nJSMap = function(data, type, dark) {' +
    'record(data); return originalRender(data, type, dark) };' +
    'nJSMap.mount = function(target, value, options) {' +
    'recordOptions(options); return originalRender.mount(target, value, options) };', context)
  await vm.runInContext(script, context)
  return { map, status, mountOptions, display: () => result }
}

async function check(file) {
  const source = fs.readFileSync(file, 'utf8')
  const template = source.match(/\x60<script>\(async function\(\) \{[\s\S]*?<\/script>\x60/)[0]
  const script = vm.runInNewContext(template).slice(8, -9)
  const small = await preview(script, { amount: 3 })
  assert.equal(Object.values(small.display())[0], 3)
  assert.equal(small.map.children[0].hidden, true)
  assert.equal(small.mountOptions.collapseAll, false)
  const smallNested = await preview(script, { nested: { amount: 7 }, items: [true] })
  assert.doesNotMatch(smallNested.map.children.at(-1).innerHTML, /data-json-open/)
  assert.match(smallNested.map.children.at(-1).innerHTML, />7</)
  assert.match(smallNested.map.children.at(-1).innerHTML, />true</)
  const records = await preview(script, { rows: [{ '<name>': '<first>', ok: false }, { ok: null, '<name>': 'second' }] })
  const recordHTML = records.map.children.at(-1).innerHTML
  assert.match(recordHTML, /scope="col"[^>]*>&#60;name&#62;<\/th>/)
  assert.match(recordHTML, />&#60;first&#62;<.*>false<.*>second<.*>null</)
  const varied = await preview(script, [{ a: 1 }, { b: 2 }])
  assert.doesNotMatch(varied.map.children.at(-1).innerHTML, /njsmap_records/)
  const pagedRecords = await preview(script, Array.from({ length: 201 }, (_, i) => ({ id: i })))
  const [pager, hiddenBulk, recordRows] = pagedRecords.map.children
  assert.equal(hiddenBulk.hidden, true)
  assert.equal((recordRows.innerHTML.match(/<td /g) || []).length, 200)
  pager.children[2].click()
  assert.equal((recordRows.innerHTML.match(/<td /g) || []).length, 1)
  assert.match(recordRows.innerHTML, />id<.*>200</)
  const boundary = await preview(script, { items: Array(11).fill('<literal>') })
  const boundaryRows = boundary.map.children.at(-1)
  assert.doesNotMatch(boundaryRows.innerHTML, /data-json-open/)
  assert.match(boundaryRows.innerHTML, /&#60;literal&#62;/)
  const single = await preview(script, { items: Array(12).fill(true) })
  assert.equal(single.map.children[0].hidden, true)
  assert.equal(single.map.children.at(-1).toggles.length, 1)
  const larger = await preview(script, { nested: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, 7])), items: [true] })
  const [mapBulk, mapRows] = larger.map.children
  assert.equal(mapRows.toggles[0].getAttribute('aria-expanded'), 'true')
  assert.equal(mapRows.toggles[0].getAttribute('aria-label'), 'Collapse named entries')
  assert.equal(mapRows.toggles[1].getAttribute('aria-label'), 'Collapse items')
  assert.ok(mapRows.innerHTML.includes('{…}'))
  assert.ok(mapRows.innerHTML.includes('[…]'))
  assert.equal(mapRows.toggles[1].nextElementSibling.lastElementChild.hidden, true)
  mapBulk.children[0].click()
  assert.ok(mapRows.toggles.every(item => item.getAttribute('aria-expanded') === 'false'))
  assert.equal(mapRows.toggles[1].getAttribute('aria-label'), 'Expand 1 item')
  mapBulk.children[0].click()
  assert.ok(mapRows.toggles.every(item => item.getAttribute('aria-expanded') === 'true'))

  const rows = Array.from({ length: 25001 }, (_, index) => index === 0 ? { nested: '<literal>' } :
    index === 1 ? [{ contained: true }, []] : 'x'.repeat(57))
  const wide = await preview(script, rows)
  assert.equal(wide.mountOptions.collapseAll, true)
  const [controls, bulk, rootRows] = wide.map.children
  const press = text => controls.children.find(item => item.getAttribute?.('aria-label') === text).click()
  assert.equal(controls.children[0].textContent, '«')
  assert.equal(controls.children[2].textContent, '»')
  const pageStatus = controls.children.at(-1)
  assert.equal(Object.keys(wide.display()).length, 200)
  assert.equal(pageStatus.textContent.trim(), '1–200 of 25001')
  assert.match(Object.values(wide.display())[0], /data-json-open="0"/)
  assert.match(rootRows.innerHTML, /data-json-open="0">\+<\/button>/)
  assert.match(rootRows.innerHTML, /aria-label="Expand 2 items" data-json-open="1"/)
  assert.match(rootRows.innerHTML, /class="njsmap_tree_count">2<\/span>/)
  const button = rootRows.toggles[0]
  const branch = button.nextElementSibling.nextElementSibling
  const toggle = () => rootRows.click({ target: { closest: () => button }, stopPropagation() {} })
  toggle()
  assert.match(Object.values(wide.display())[0], /&#60;literal&#62;/)
  assert.equal(button.textContent, '−')
  assert.equal(button.getAttribute('aria-expanded'), 'true')
  assert.equal(button.getAttribute('aria-label'), 'Collapse named entries')
  assert.equal(branch.hidden, false)
  assert.equal(pageStatus.textContent.trim(), '1–200 of 25001')
  toggle()
  assert.equal(button.textContent, '+')
  assert.equal(button.getAttribute('aria-expanded'), 'false')
  assert.equal(button.getAttribute('aria-label'), 'Expand named entries')
  assert.equal(branch.hidden, true)
  assert.equal(branch.children.length, 0)
  const [bulkButton] = bulk.children
  assert.equal(bulk.children.length, 1)
  assert.equal(bulkButton.getAttribute('aria-label'), 'Expand all items on this page')
  bulkButton.click()
  assert.ok(rootRows.toggles.every(item => item.getAttribute('aria-expanded') === 'true'))
  const secondHint = rootRows.toggles[1].nextElementSibling
  const secondBranch = secondHint.nextElementSibling
  const [inlineBulk] = secondHint.lastElementChild.children
  assert.match(inlineBulk.className, /njsmap_tree_bulk_inline/)
  assert.equal(secondBranch.children.at(-1).toggles[0].getAttribute('aria-expanded'), 'false')
  assert.match(secondBranch.children.at(-1).innerHTML, /aria-label="Expand 0 items"/)
  inlineBulk.click()
  assert.equal(inlineBulk.getAttribute('aria-label'), 'Collapse all items')
  assert.equal(secondBranch.children.at(-1).toggles[0].getAttribute('aria-expanded'), 'true')
  assert.equal(bulkButton.getAttribute('aria-label'), 'Collapse all items on this page')
  bulkButton.click()
  assert.ok(rootRows.toggles.every(item => item.getAttribute('aria-expanded') === 'false'))
  assert.equal(secondHint.lastElementChild.children.length, 0)
  press('Next page')
  assert.equal(pageStatus.textContent.trim(), '201–400 of 25001')
  assert.equal(bulk.hidden, true)
  press('Previous page')
  assert.equal(pageStatus.textContent.trim(), '1–200 of 25001')
  assert.equal(bulk.hidden, false)

  let deep = true
  for (let depth = 0; depth < 70; depth++) deep = { nested: deep }
  const nested = await preview(script, deep)
  assert.equal(nested.mountOptions.collapseAll, false)
  assert.match(nested.map.children.at(-1).innerHTML, /data-json-open="0">\+<\/button>/)
  assert.equal(nested.status.hidden, true)
  console.log('PASS JSON paging: ' + file)
}

;(async () => {
  for (const file of ['oJobBrowse.yaml', '../openaf/js/owrap.server.browse.js']) await check(file)
})().catch(error => { console.error(error); process.exitCode = 1 })
