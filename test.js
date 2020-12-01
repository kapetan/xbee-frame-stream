const crypto = require('crypto')
const { Transform } = require('stream')
const test = require('tape')
const encoding = require('xbee-frame')
const srpParameters = require('@kapetan/secure-remote-password/parameters')
const srpClient = require('@kapetan/secure-remote-password/client')
const srpServer = require('@kapetan/secure-remote-password/server')
const ProtocolStream = require('.')

const ALGORITHM = 'aes-256-ctr'
const USERNAME = 'username'
const PASSWORD = 'password'

test('authentication and send/receive frame', t => {
  const params = srpParameters(1024)

  let onframe = (data, enc, cb) => {
    t.equal(data.length, 134)

    const firstFrame = encoding.decode(data)

    t.equal(firstFrame.type, encoding.FrameType.BLE_UNLOCK_REQUEST)
    t.equal(firstFrame.step, 1)
    t.equal(firstFrame.clientEphemeral.length, 128)

    const salt = srpClient.generateSalt(params).slice(0, 8)
    const privateKey = srpClient.derivePrivateKey(salt, USERNAME, PASSWORD, params)
    const verifier = srpClient.deriveVerifier(privateKey, params)
    const serverEphemeral = srpServer.generateEphemeral(verifier, params)

    onframe = (data, enc, cb) => {
      t.equal(data.length, 38)

      const secondFrame = encoding.decode(data)

      t.equal(secondFrame.type, encoding.FrameType.BLE_UNLOCK_REQUEST)
      t.equal(secondFrame.step, 3)
      t.equal(secondFrame.clientSessionProof.length, 32)

      const serverSession = srpServer.deriveSession(
        serverEphemeral.secret,
        firstFrame.clientEphemeral.toString('hex'),
        salt,
        USERNAME,
        verifier,
        secondFrame.clientSessionProof.toString('hex'),
        params)

      onframe = (data, enc, cb) => {
        t.equal(data.length, 16)

        const decipher = crypto.createDecipheriv(
          ALGORITHM,
          Buffer.from(serverSession.key, 'hex'),
          Buffer.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1))

        const cipher = crypto.createCipheriv(
          ALGORITHM,
          Buffer.from(serverSession.key, 'hex'),
          Buffer.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1))

        const thirdFrame = encoding.decode(decipher.update(data))

        t.deepEqual(thirdFrame, {
          type: encoding.FrameType.USER_DATA_RELAY_INPUT,
          id: 1,
          destination: encoding.Interface.MICROPYTHON,
          data: Buffer.from('test-data')
        })

        protocol.once('frame', frame => {
          t.deepEqual(frame, {
            type: encoding.FrameType.USER_DATA_RELAY_OUTPUT,
            source: encoding.Interface.MICROPYTHON,
            data: Buffer.from('test-data-2')
          })

          t.end()
        })

        cb(null, cipher.update(encoding.encode({
          type: encoding.FrameType.USER_DATA_RELAY_OUTPUT,
          source: encoding.Interface.MICROPYTHON,
          data: Buffer.from('test-data-2')
        })))
      }

      cb(null, encoding.encode({
        type: encoding.FrameType.BLE_UNLOCK_RESPONSE,
        step: 4,
        serverSessionProof: Buffer.from(serverSession.proof, 'hex'),
        txNonce: Buffer.alloc(12),
        rxNonce: Buffer.alloc(12)
      }))

      protocol.send({
        type: encoding.FrameType.USER_DATA_RELAY_INPUT,
        id: 1,
        destination: encoding.Interface.MICROPYTHON,
        data: Buffer.from('test-data')
      })
    }

    cb(null, encoding.encode({
      type: encoding.FrameType.BLE_UNLOCK_RESPONSE,
      step: 2,
      salt: Buffer.from(salt, 'hex'),
      serverEphemeral: Buffer.from(serverEphemeral.public, 'hex')
    }))
  }

  const protocol = new ProtocolStream(USERNAME, PASSWORD)
  const transport = new Transform({
    transform (data, enc, cb) {
      onframe(data, enc, cb)
    }
  })

  protocol.pipe(transport).pipe(protocol)
})

test('authentication error', t => {
  const protocol = new ProtocolStream(USERNAME, PASSWORD)
  const transport = new Transform({
    transform (data, enc, cb) {
      cb(null, encoding.encode({
        type: encoding.FrameType.BLE_UNLOCK_RESPONSE,
        step: encoding.StepError.BAD_PROOF_OF_KEY
      }))
    }
  })

  protocol.on('error', err => {
    t.match(err.message, /BAD_PROOF_OF_KEY/)
    t.end()
  })

  protocol.pipe(transport).pipe(protocol)
})
