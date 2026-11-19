// Run with node; optionally set CORE_BROWSE_MODULE to the sibling renderer.
const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const source = fs.readFileSync(process.env.CORE_BROWSE_MODULE || 'oJobBrowse.yaml', 'utf8')
const start = source.indexOf('content += `<script>') + 'content += `<script>'.length
const script = source.slice(start, source.indexOf('</script>', start))
const saved = new Map()
let checks = 0
function equal(actual, expected) { assert.equal(actual, expected); checks++ }
function setup() {
  let active, applied = 0, selected = 0, modal = false
  class Element {
    constructor(editable = false) { this.editable = editable; this.listeners = {}; this.attributes = {}; this.style = {} }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn) }
    fire(name, event = {}) { for (const fn of this.listeners[name] || []) fn.call(this, event) }
    closest() { return this.editable ? this : null }
    setAttribute(name, value) { this.attributes[name] = value }
    removeAttribute(name) { delete this.attributes[name] }
    focus() { active = this }
  }
  const button = new Element(), clear = new Element(), setting = new Element()
  const input = new Element(true), size = new Element(true), apply = new Element(), message = new Element()
  input.value = 'existing search'
  input.select = () => selected++
  size.value = '25'
  const form = new Element(), panel = new Element()
  panel.offsetWidth = 280; panel.offsetHeight = 220
  panel.open = false
  panel.matches = () => panel.open
  panel.showPopover = () => { panel.open = true }
  panel.hidePopover = () => { panel.open = false }
  panel.getBoundingClientRect = () => ({left:10, top:20, bottom:46})
  panel.querySelector = selector => selector == 'form.browse-controls' ? form : input
  button.getBoundingClientRect = panel.getBoundingClientRect
  form.querySelector = selector => ({'input[name=q]':input, 'input[name=size]':size, '.browse-apply':apply, '.browse-live-status':message})[selector]
  form.requestSubmit = submitter => { equal(submitter, apply); applied++; form.fire('submit') }
  const nodes = {'browse-options-toggle':button, 'browse-options':panel, 'browse-clear-search':clear, 'browse-shortcut-enabled':setting, 'browse-search-notice':{dataset:{}}}
  const document = new Element()
  document.getElementById = id => nodes[id] || null
  document.querySelector = () => modal ? {} : null
  const window = new Element()
  window.innerWidth = 1000; window.innerHeight = 800
  window.location = {search:'?q=existing',href:'http://localhost/browse/?q=existing'}
  vm.runInNewContext(script, {
    document, window, Element, URLSearchParams,
    localStorage: {getItem:key => saved.get(key), setItem:(key,value) => saved.set(key,value)},
    ResizeObserver: class { observe() {} }, clearTimeout, setTimeout:() => 1, setInterval:() => 1
  })
  document.fire('DOMContentLoaded')
  const key = (key, properties = {}, target = new Element()) => {
    const event = {key,target,preventDefault() { this.prevented = true },stopPropagation() { this.stopped = true },...properties}
    document.fire('keydown', event)
    return event
  }
  return {key,input,size,form,panel,button,clear,setting, get active() {return active}, get selected() {return selected}, get applied() {return applied}, setModal:value => {modal=value}}
}
let app = setup()
equal(app.key('/').prevented, true)
equal(app.panel.open, true)
equal(app.active, app.input)
equal(app.selected, 1)
equal(app.input.value, 'existing search')
for (const properties of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{repeat:true},{defaultPrevented:true}]) {
  equal(app.key('/', properties).prevented, undefined)
}
equal(app.key('/', {}, app.input).prevented, undefined)
app.input.editable = false
app.input.isContentEditable = true
equal(app.key('/', {}, app.input).prevented, undefined)
app.input.isContentEditable = false
app.input.editable = true
app.setModal(true)
equal(app.key('/').prevented, undefined)
app.setModal(false)
// Slash may require Shift on a localized keyboard.
equal(app.key('/', {shiftKey:true}).prevented, true)
app.setting.checked = false; app.setting.fire('change')
equal(app.key('/').prevented, undefined)
equal(app.button.attributes['aria-keyshortcuts'], undefined)
app = setup()
equal(app.setting.checked, false)
equal(app.key('/').prevented, undefined)
app.setting.checked = true; app.setting.fire('change')
equal(app.key('/').prevented, true)
const enter = properties => {
  const event = {key:'Enter',preventDefault() {this.prevented=true},stopPropagation() {},...properties}
  app.input.fire('keydown', event)
  return event
}
equal(enter({}).prevented, undefined)
equal(app.applied, 0)
for (const properties of [{shiftKey:true,isComposing:true},{shiftKey:true,keyCode:229},{shiftKey:true,ctrlKey:true}]) {
  equal(enter(properties).prevented, undefined)
}
equal(app.input.value, 'existing search')
equal(enter({shiftKey:true}).prevented, true)
equal(app.input.value, '')
equal(app.applied, 1)
equal(app.size.value, '25')
console.log('PASS ' + checks + ' browser keyboard assertions')
