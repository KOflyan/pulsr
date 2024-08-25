/* eslint-disable */

const http = require('http')
console.log('Starting server ....')

http
  .createServer(function (req, res) {
    console.log('request received')
    res.write('Hello World!')
    res.end()
  })
  .listen(8081, () => {
    console.log('server is running!')
  })
