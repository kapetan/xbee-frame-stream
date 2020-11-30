# xbee-frame-stream

XBee frame protocol for the BLE API.

    npm install xbee-frame-stream

## Usage

This library is transport agnostic. It implements the XBee BLE protocol, authenticates using [secure remote password](https://github.com/kapetan/secure-remote-password), and encrypts/decrypts the frames with the derived session key.

```js
const ProtocolStream = require('xbee-frame-stream')

// The constructor accepts the API username and password.
// The username for XBee BLE API is always 'apiservice'.
const protocol = new ProtocolStream('apiservice', 'password')

// Received frames are emitted on the protocol instance
protocol.on('frame', frame => console.log(frame))

// Send data to the remote endpoint.
// Data contains the encoded frame.
protocol.on('data', data => {})

// Send frame
protocol.send({
  type: ProtocolStream.FrameType.USER_DATA_RELAY_INPUT,
  id: 1,
  destination: ProtocolStream.Interface.MICROPYTHON,
  data: Buffer.from('test data')
})

// Write received data to the protocol instance
protocol.write(buffer)
````

The above can also be archieved using `pipe` if the there is a stream implementation of the transport. The demo directory contains a `Web Bluetooth` based stream as an example.

```js
protocol.on('frame', frame => console.log(frame))

protocol.pipe(transport).pipe(protocol)

protocol.send({ })
```

See [xbee-frame](https://github.com/kapetan/xbee-frame) library for accepted frame types.

## Demo

The [demo app](https://kapetan.github.io/xbee-frame-stream/demo/build) can only run on browsers that support [Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API).

Connect to a XBee device:

1. Fill out the device BLE advertising name prefix (required by `Web Bluetooth`, by default it's something with *XBee*).
1. Fill out the configured device BLE password.
1. Press the `Connect` button.
1. Use the text area to send *User Data Relay Input* frames to the device with the selected encoding (the hex encoding may contain spaces).
1. In the left and right column respectively are the sent and received frames rendered.

## API

#### Class: `ProtocolStream(username, password)`

Create new instance of the protocol stream with the given username and password. The username for XBee BLE API is always `'apiservice'`.

##### Event: `frame`

Emit the received frame object. See [xbee-frame](https://github.com/kapetan/xbee-frame) library for how the frames are structured.

##### `send(frame)`

Send frame to receiver.

#### `ProtocolStream.FrameType`

[FrameType](https://github.com/kapetan/xbee-frame#frametype) enum.

#### `ProtocolStream.Interface`

[Interface](https://github.com/kapetan/xbee-frame#interface) enum.

#### `ProtocolStream.ATCommandStatus`

[ATCommandStatus](https://github.com/kapetan/xbee-frame#atcommandstatus) enum.

#### `ProtocolStream.DeliveryStatus`

[DeliveryStatus](https://github.com/kapetan/xbee-frame#deliverystatus) enum.
