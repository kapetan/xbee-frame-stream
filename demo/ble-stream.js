const { Duplex } = require('stream')

const API_SERVICE = '53da53b9-0447-425a-b9ea-9837505eb59a'
const REQUEST_CHARACTERISTIC = '7dddca00-3e05-4651-9254-44074792c590'
const RESPONSE_CHARACTERISTIC = 'f9279ee9-2cd0-410c-81cc-adf11e4e5aea'

class BleStream extends Duplex {
  static async request (namePrefix) {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: namePrefix }],
      optionalServices: [API_SERVICE]
    })

    return new BleStream(device)
  }

  constructor (device) {
    super()

    const connect = async () => {
      const server = await device.gatt.connect()
      const service = await server.getPrimaryService(API_SERVICE)
      const requestCharacteristic = await service.getCharacteristic(REQUEST_CHARACTERISTIC)
      const responseCharacteristic = await service.getCharacteristic(RESPONSE_CHARACTERISTIC)

      responseCharacteristic.addEventListener('characteristicvaluechanged', e => {
        this.push(Buffer.from(e.target.value.buffer))
      })

      await responseCharacteristic.startNotifications()
      return requestCharacteristic
    }

    device.addEventListener('gattserverdisconnected', () => {
      this.destroy(new Error('GATT server disconnected'))
    })

    this.device = device
    this._connect = connect()
  }

  _write (data, encoding, cb) {
    this._connect
      .then(requestCharacteristic => {
        return requestCharacteristic.writeValue(data)
      })
      .then(() => cb())
      .catch(cb)
  }

  _read () {}

  _destroy (err, cb) {
    this.device.gatt.disconnect()
    cb(err)
  }
}

module.exports = BleStream
