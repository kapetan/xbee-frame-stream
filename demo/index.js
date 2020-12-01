const ProtocolStream = require('..')
const BleStream = require('./ble-stream')

const connectForm = document.querySelector('.connect-form')
const dataForm = document.querySelector('.data-form')
const frameTypeSelect = document.getElementById('frame-type')
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

frameTypeSelect.onchange = function (e) {
  const frameType = e.target.value
  const commandControls = dataForm.querySelector('.command-controls')

  if (frameType === 'USER_DATA_RELAY_INPUT') commandControls.classList.add('hidden')
  else if (frameType === 'LOCAL_AT_COMMAND_REQUEST') commandControls.classList.remove('hidden')
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
  dataForm.elements.command.removeAttribute('readonly')
  dataForm.elements.data.removeAttribute('readonly')
}

dataForm.onsubmit = function (e) {
  e.preventDefault()
  if (!protocolStream) return

  const encoding = dataForm.elements.encoding.value
  const frameType = dataForm.elements.frametype.value
  const command = dataForm.elements.command.value
  let data = dataForm.elements.data.value

  if (encoding !== 'utf8') data = data.replace(/\s|,/g, '')

  let frame = null

  if (frameType === 'USER_DATA_RELAY_INPUT') {
    frame = {
      type: ProtocolStream.FrameType.USER_DATA_RELAY_INPUT,
      id: id++,
      destination: ProtocolStream.Interface.MICROPYTHON,
      data: Buffer.from(data, encoding)
    }
  } else if (frameType === 'LOCAL_AT_COMMAND_REQUEST') {
    frame = {
      type: ProtocolStream.FrameType.LOCAL_AT_COMMAND_REQUEST,
      id: id++,
      command: command
    }

    if (data) frame.value = data
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
