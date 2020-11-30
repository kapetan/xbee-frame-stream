const { Duplex } = require('stream')
const crypto = require('crypto')
const encoding = require('xbee-frame')
const srpParameters = require('@kapetan/secure-remote-password/parameters')
const srpClient = require('@kapetan/secure-remote-password/client')

const ALGORITHM = 'aes-256-ctr'

function validateBleUnlockResponse (response, expectedStep) {
  if (response.type !== encoding.FrameType.BLE_UNLOCK_RESPONSE) {
    throw new Error(`unexpected frame type ${encoding.FrameType.getName(response.type) || response.type}`)
  }
  if (response.step >= 0x80) {
    throw new Error(`step error condition encountered ${encoding.StepError.getName(response.step) || response.step}`)
  }
  if (response.step !== expectedStep) {
    throw new Error(`unexpected step ${response.step}`)
  }
}

function getCounter (hexNonce) {
  const nonce = Buffer.from(hexNonce, 'hex')
  const counter = Buffer.from([0, 0, 0, 1])
  return Buffer.concat([nonce, counter], nonce.length + counter.length)
}

class ProtocolStream extends Duplex {
  constructor (username, password) {
    super()

    this._buffer = Buffer.alloc(0)
    this._cb = null
    this._onreadable = null

    let decipher = null

    const read = async (n) => {
      return new Promise((resolve, reject) => {
        const onreadable = (buffer, cb) => {
          if (buffer == null) {
            reject(new Error('unexpected end of stream'))
            cb()
          } else if (buffer.length < n) {
            this._onreadable = onreadable
            if (cb) cb()
          } else {
            this._onreadable = null
            const data = buffer.slice(0, n)
            this._buffer = buffer.slice(n)
            resolve(data)
          }
        }

        onreadable(this._buffer, this._cb)
      })
    }

    const readFrame = async () => {
      // Header consists of start delimeter and two byte length
      let header = await read(3)
      if (decipher) header = decipher.update(header)
      const length = header.readUInt16BE(1)
      // Add one for checksum not included in length
      let body = await read(length + 1)
      if (decipher) body = decipher.update(body)
      const frame = Buffer.concat([header, body], length + 4)
      return encoding.decode(frame)
    }

    const handshake = async () => {
      const params = srpParameters(1024)
      const clientEphemeral = srpClient.generateEphemeral(params)

      this.push(encoding.encode({
        type: encoding.FrameType.BLE_UNLOCK_REQUEST,
        step: 1,
        clientEphemeral: Buffer.from(clientEphemeral.public, 'hex')
      }))

      let response = await readFrame()
      validateBleUnlockResponse(response, 2)

      const privateKey = srpClient.derivePrivateKey(
        response.salt.toString('hex'), username, password, params)
      const clientSession = srpClient.deriveSession(
        clientEphemeral.secret,
        response.serverEphemeral.toString('hex'),
        response.salt.toString('hex'),
        username,
        privateKey,
        params)

      this.push(encoding.encode({
        type: encoding.FrameType.BLE_UNLOCK_REQUEST,
        step: 3,
        clientSessionProof: Buffer.from(clientSession.proof, 'hex')
      }))

      response = await readFrame()
      validateBleUnlockResponse(response, 4)

      srpClient.verifySession(
        clientEphemeral.public,
        clientSession,
        response.serverSessionProof.toString('hex'),
        params)

      decipher = crypto.createDecipheriv(
        ALGORITHM,
        Buffer.from(clientSession.key, 'hex'),
        getCounter(response.rxNonce))

      return crypto.createCipheriv(
        ALGORITHM,
        Buffer.from(clientSession.key, 'hex'),
        getCounter(response.txNonce))
    }

    this._handshake = handshake()

    const parse = async () => {
      await this._handshake
      while (!this.destroyed) {
        const frame = await readFrame()
        this.emit('frame', frame)
      }
    }

    parse()
      .catch(err => this.destroy(err))
  }

  send (frame) {
    this._handshake
      .then(cipher => {
        let data = encoding.encode(frame)
        data = cipher.update(data)
        this.push(data)
      })
  }

  _write (data, encoding, cb) {
    this._cb = cb
    this._buffer = Buffer.concat([this._buffer, data], this._buffer.length + data.length)
    if (this._onreadable) this._onreadable(this._buffer, cb)
  }

  _read () {}

  _destroy (err, cb) {
    if (this._onreadable) this._onreadable(null, cb)
    else cb(err)
  }
}

ProtocolStream.FrameType = encoding.FrameType
ProtocolStream.Interface = encoding.Interface
ProtocolStream.ATCommandStatus = encoding.ATCommandStatus
ProtocolStream.DeliveryStatus = encoding.DeliveryStatus

module.exports = ProtocolStream
