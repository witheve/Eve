Casper = require('casper').Casper
colorizer = require('colorizer').create('Colorizer')
casper = new Casper(clientScripts: ['spec/jquery.min.js'])

Casper.prototype.capture_resource = (name) ->
  console.log colorizer.colorize("  ✓", 'INFO') + " #{name}()"
  @captureSelector "spec/results/#{name}.png", ".#{name}"

Casper.prototype.headline = (name) ->
  @echo ''
  @echo '----------------------'
  @echo "#{name}", 'WARNING'
  @echo '----------------------'
  @echo ''

# initialize tests

casper.start 'http://localhost:3000', ->
  # @test.assertHttpStatus 200, 'server is running'

# buttons
casper.then ->
  @headline 'buttons'
  @capture_resource 'button'
  @capture_resource 'button-color'
  @capture_resource 'button-small'
  @capture_resource 'button-medium'
  @capture_resource 'button-large'
  @capture_resource 'button-custom-size'
  @capture_resource 'button-disabled'
  @capture_resource 'simple-button'
  @capture_resource 'simple-color'
  @capture_resource 'simple-size'
  @capture_resource 'simple-disabled'

# code
casper.then ->
  @headline 'code'
  @capture_resource 'code'
  @capture_resource 'pre'

# forms
casper.then ->
  @headline 'forms'
  @capture_resource 'input'
  @capture_resource 'input-search'
  @capture_resource 'input-disabled'
  @capture_resource 'input-error'
  @capture_resource 'input-warning'
  @capture_resource 'input-success'
  @capture_resource 'field'
  @capture_resource 'field-error'
  @capture_resource 'field-warning'
  @capture_resource 'field-success'

# gradients
casper.then ->
  @headline 'gradients'
  @capture_resource 'gradient'
  @capture_resource 'gradient-multiple-stops'
  @capture_resource 'gradient-mixin'
  @capture_resource 'simple-gradient'
  @capture_resource 'noise-gradient'
  @capture_resource 'simple-noise-gradient'

casper.then ->
  @echo ""

casper.run()