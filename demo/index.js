const ProtocolStream = require('..')
const BleStream = require('./ble-stream')

const connectForm = document.querySelector('.connect-form')
const dataForm = document.querySelector('.data-form')
const clearSent = document.getElementById('clear-sent')
const clearReceived = document.getElementById('clear-received')
const sentFrames = document.getElementById('sent')
const receivedFrames = document.getElementById('received')

let id = 1
let bleStream = null
let protocolStream = null

function replacer (key, value) {
  let self = this[key]

  if (self instanceof Uint8Array) {
    self = Buffer.from(self)
  }
  if (Buffer.isBuffer(self)) {
    return self.toString('hex')
  }

  return value
}

function renderFrame (frame) {
  const div = document.createElement('div')
  div.textContent = JSON.stringify(frame, replacer, 2)
  return div
}

connectForm.onsubmit = async function (e) {
  e.preventDefault()
  if (protocolStream) return

  const name = connectForm.elements.name.value
  const password = connectForm.elements.password.value

  try {
    bleStream = await BleStream.request(name)
  } catch (err) {
    return
  }

  protocolStream = new ProtocolStream('apiservice', password)

  protocolStream.on('frame', frame => {
    const div = renderFrame(frame)
    receivedFrames.appendChild(div)
    div.scrollIntoView()
  })

  protocolStream.pipe(bleStream).pipe(protocolStream)
  dataForm.elements.data.removeAttribute('readonly')
}

dataForm.onsubmit = function (e) {
  e.preventDefault()
  if (!protocolStream) return

  const encoding = dataForm.elements.encoding.value
  let data = dataForm.elements.data.value

  if (encoding !== 'utf8') data = data.replace(/\s|,/g, '')

  const frame = {
    type: ProtocolStream.FrameType.USER_DATA_RELAY_INPUT,
    id: id++,
    destination: ProtocolStream.Interface.MICROPYTHON,
    data: Buffer.from(data, encoding)
  }

  protocolStream.send(frame)

  const div = renderFrame(frame)
  sentFrames.appendChild(div)
  div.scrollIntoView()
}

clearSent.onclick = function (e) {
  e.preventDefault()
  sentFrames.innerHTML = ''
}

clearReceived.onclick = function (e) {
  e.preventDefault()
  receivedFrames.innerHTML = ''
}
